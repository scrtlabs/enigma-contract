pragma solidity ^0.4.22;

import "./zeppelin/SafeMath.sol";
import "./zeppelin/ECRecovery.sol";
import "./utils/GetCode2.sol";
import "./utils/RLP.sol";

contract IERC20 {
    function balanceOf(address who) public constant returns (uint256);

    function transfer(address to, uint256 value) public returns (bool);

    function allowance(address owner, address spender) public constant returns (uint256);

    function transferFrom(address from, address to, uint256 value) public returns (bool);

    function approve(address spender, uint256 value) public returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}


contract Enigma {
    using SafeMath for uint256;
    using ECRecovery for bytes32;
    using RLP for RLP.RLPItem;
    using RLP for RLP.Iterator;
    using RLP for bytes;

    IERC20 public engToken;

    struct Task {
        string callable;
        bytes callableArgs;
        string callback;
        address worker;
        bytes sig;
        uint256 reward;
        TaskStatus status;
    }
    enum TaskStatus {InProgress, Executed}

    struct Worker {
        address signer;
        string quote;
        uint256 balance;
        uint status; // Uninitialized: 0; Active: 1; Inactive: 2
    }

    uint workerParamsLimit;
    struct WorkersParams {
        uint256 firstBlockNumber;
        address[] workerAddresses;
        uint256 seed;
    }

    address[] public workerAddresses;
    WorkersParams[5] public workersParams;
    mapping(address => Worker) public workers;
    mapping(address => Task[]) public tasks;

    event Register(address user, address signer, bool _success);
    event ValidateSig(bytes sig, bytes32 hash, address workerAddr, bytes bytecode, bool _success);
    event CommitResults(address secretContract, address worker, bytes sig, uint reward, bool _success);
    event WorkersParameterized(uint256 seed, address[] workers, uint256 blockNumber, bool _success);

    // Enigma computation task
    event ComputeTask(address indexed callingContract, uint indexed taskId, string callable, bytes callableArgs, string callback, uint256 fee, bytes32[] preprocessors, bool _success);

    enum ReturnValue {Ok, Error}

    function Enigma(address _tokenAddress, uint _workerParamsLimit) public {
        engToken = IERC20(_tokenAddress);
        workerParamsLimit = _workerParamsLimit;
    }

    modifier workerRegistered(address user) {
        Worker memory worker = workers[user];
        require(worker.status > 0, "Unregistered worker.");
        _;
    }

    function register(address signer, string quote)
    public
    payable
    returns (ReturnValue) {
        // Register a new worker and deposit stake
        // require(workers[msg.sender].status == 0, "Worker already register.");

        workerAddresses.push(msg.sender);

        workers[msg.sender].signer = signer;
        workers[msg.sender].balance = msg.value;
        workers[msg.sender].quote = quote;
        workers[msg.sender].status = 1;

        emit Register(msg.sender, signer, true);

        return ReturnValue.Ok;
    }

    function compute(address secretContract, string callable, bytes callableArgs, string callback, uint256 fee, bytes32[] preprocessors)
    public
    returns (ReturnValue) {
        // Create a computation task and save the fee in escrow
        uint taskId = tasks[secretContract].length;
        tasks[secretContract].length++;

        tasks[secretContract][taskId].reward = fee;
        tasks[secretContract][taskId].callable = callable;
        tasks[secretContract][taskId].callableArgs = callableArgs;
        tasks[secretContract][taskId].callback = callback;
        tasks[secretContract][taskId].status = TaskStatus.InProgress;

        // Emit the ComputeTask event which each node is watching for
        emit ComputeTask(secretContract, taskId, callable, callableArgs, callback, fee, preprocessors, true);

        // Transferring before emitting does not work
        // TODO: check the allowance first
        engToken.transferFrom(msg.sender, this, fee);

        return ReturnValue.Ok;
    }

    function verifySignature(address secretContract, Task task, bytes data, bytes sig)
    internal
    constant
    returns (address) {
        // Recreating a data hash to validate the signature
        bytes memory code = GetCode2.at(secretContract);

        // Build a hash to validate that the I/Os are matching
        bytes32 hash = keccak256(task.callableArgs, data, code);
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = sha3(prefix, hash);

        // TODO: this returns an address where we want to verify a public key
        // I don't believe that Solidity has a general purpose signature
        // validator. However, we know that an Ethereum address is the hash
        // of a public key, so we can use our public key to generate a
        // virtual address for validation.
        address workerAddr = prefixedHash.recover(sig);

        emit ValidateSig(sig, prefixedHash, workerAddr, code, true);
        return workerAddr;
    }

    // copied from GnosisSafe
    // https://github.com/gnosis/gnosis-safe-contracts/blob/master/contracts/GnosisSafe.sol
    function executeCall(address to, uint256 value, bytes data) internal returns (bool success) {
        assembly {
            success := call(gas, to, value, add(data, 0x20), mload(data), 0, 0)
        }
    }

    function commitResults(address dappContract, uint taskId, bytes data, bytes sig)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Task must be solved only once
        require(tasks[dappContract][taskId].status == TaskStatus.InProgress, "Illegal status, task must be in progress.");

        address sigAddr = verifySignature(dappContract, tasks[dappContract][taskId], data, sig);
        require(sigAddr != address(0), "Cannot verify this signature.");
        require(sigAddr == workers[msg.sender].signer, "Invalid signature.");

        // The contract must hold enough fund to distribute reward
        // TODO: validate that the reward matches the opcodes computed
        uint256 reward = tasks[dappContract][taskId].reward;
        require(reward > 0, "Reward cannot be zero.");

        // Invoking the callback method of the original contract
        // TODO: disable for now because the Python tests don't create deals, works with the JS tests
//        require(executeCall(secretContract, msg.value, data), "Unable to invoke the callback");

        // Keep a trace of the task worker and proof
        tasks[dappContract][taskId].worker = msg.sender;
        tasks[dappContract][taskId].sig = sig;
        tasks[dappContract][taskId].status = TaskStatus.Executed;

        // TODO: send directly to the worker's custodian instead
        // Put the reward in the worker's bank
        // He can withdraw later
        Worker storage worker = workers[msg.sender];
        worker.balance = worker.balance.add(reward);

        emit CommitResults(dappContract, msg.sender, sig, reward, true);

        return ReturnValue.Ok;
    }

    function setWorkersParams(uint256 seed)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        uint ti = 0;
        for (uint pi = 0; pi < workersParams.length; pi++) {
            // Find an empty slot in the array, if full use the lowest block number
            if (workersParams[pi].firstBlockNumber == 0) {
                ti = pi;
                break;
            } else if (workersParams[pi].firstBlockNumber < workersParams[ti].firstBlockNumber) {
                ti = pi;
            }
        }
        workersParams[ti].firstBlockNumber = block.number;
        workersParams[ti].seed = seed;

        // Copy the current worker list
        for (uint wi = 0; wi < workerAddresses.length; wi++) {
            workersParams[ti].workerAddresses.length++;
            workersParams[ti].workerAddresses[wi] = workerAddresses[wi];
        }

        emit WorkersParameterized(seed, workerAddresses, block.number, true);

        return ReturnValue.Ok;
    }
}
