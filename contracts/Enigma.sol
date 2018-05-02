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
        bytes32 callable;
        bytes callableArgs;
        bytes32 callback;
        address worker;
        bytes sig;
        uint reward;
    }

    struct Worker {
        bytes32 url;
        string pkey;
        string quote;
        uint256 balance;
        uint status; // Uninitialized: 0; Active: 1; Inactive: 2
    }

    address[] public workerIndex;
    mapping(address => Worker) public workers;
    mapping(address => Task[]) public tasks;

    event Register(bytes32 url, address user, string pkey, bool _success);
    event Logout(address user, bool _success);
    event ValidateSig(bytes sig, bytes32 hash, address workerAddr, bytes bytecode, bool _success);
    event SolveTask(address secretContract, address worker, bytes sig, uint reward, bool _success);

    // Enigma computation task
    event ComputeTask(address callingContract, uint taskId, bytes32 callable, bytes callableArgs, bytes32 callback, uint fee, bytes32[] preprocessors, string lastArg, bool _success);

    enum ReturnValue {Ok, Error}

    function Enigma(address _tokenAddress) public {
        engToken = IERC20(_tokenAddress);
    }

    modifier workerRegistered(address user) {
        Worker memory worker = workers[user];
        require(worker.status > 0, "Unregistered worker.");
        _;
    }

    function register(bytes32 url, string pkey, string quote)
    public
    payable
    returns (ReturnValue) {
        // Register a new worker and deposit stake
        // require(workers[msg.sender].status == 0, "Worker already register.");

        workerIndex.push(msg.sender);

        workers[msg.sender].url = url;
        workers[msg.sender].pkey = pkey;
        workers[msg.sender].balance = msg.value;
        workers[msg.sender].quote = quote;
        workers[msg.sender].status = 1;

        emit Register(url, msg.sender, pkey, true);

        return ReturnValue.Ok;
    }

    //TODO: we don't want this
    function logout()
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // A worker stops accepting tasks
        workers[msg.sender].status = 2;

        emit Logout(msg.sender, true);

        return ReturnValue.Ok;
    }

    function compute(address secretContract, bytes32 callable, bytes callableArgs, bytes32 callback, bytes32[] preprocessors)
    public
    payable
    returns (ReturnValue) {
        // Each task invoked by a contract has a sequential id
        // Skipping 0 to avoid encoding issues

        var args = callableArgs.toRLPItem(true);
        var iter = args.iterator();

        while(iter.hasNext()) {
            string memory arg = iter.next().toAscii();
        }

        uint taskId = tasks[secretContract].length;
        tasks[secretContract].length++;

        tasks[secretContract][taskId].reward = msg.value;
        tasks[secretContract][taskId].callable = callable;
        tasks[secretContract][taskId].callableArgs = callableArgs;
        tasks[secretContract][taskId].callback = callback;

        // Emit the ComputeTask event which each node is watching for
        emit ComputeTask(secretContract, taskId, callable, callableArgs, callback, msg.value, preprocessors, arg, true);

        return ReturnValue.Ok;
    }

    function verifySignature(address secretContract, Task task, bytes results, bytes sig)
    internal
    constant
    returns (address) {
        // Recreating a data hash to validate the signature
        bytes memory code = GetCode2.at(secretContract);

        // Build a hash to validate that the I/Os are matching
        bytes32 hash = keccak256(task.callable, task.callableArgs, results, code);
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

    // TODO: remove the hash parameter and recreate it in the function
    function solveTask(address secretContract, uint taskId, bytes results, bytes sig)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Task must be solved only once
        require(tasks[secretContract][taskId].worker == address(0), "Task already solved.");

        address sigAddr = verifySignature(secretContract, tasks[secretContract][taskId], results, sig);
        require(sigAddr != address(0), "Cannot verify this signature.");
        require(sigAddr == msg.sender, "Invalid signature.");

        // The contract must hold enough fund to distribute reward
        // TODO: validate that the reward matches the opcodes computed
        uint reward = tasks[secretContract][taskId].reward;
        require(reward > 0, "Reward cannot be zero.");

        // Keep a trace of the task worker and proof
        tasks[secretContract][taskId].worker = msg.sender;
        tasks[secretContract][taskId].sig = sig;

        // TODO: send directly to the worker's custodian instead
        // Put the reward in the worker's bank
        // He can withdraw later
        Worker storage worker = workers[msg.sender];
        worker.balance = worker.balance.add(reward);

        emit SolveTask(secretContract, msg.sender, sig, reward, true);

        return ReturnValue.Ok;
    }
}
