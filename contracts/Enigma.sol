pragma solidity ^0.4.22;

import "./zeppelin/SafeMath.sol";
import "./zeppelin/ECRecovery.sol";

library GetCode {
    function at(address _addr) public view returns (bytes o_code) {
        assembly {
            // retrieve the size of the code, this needs assembly
            let size := extcodesize(_addr)
            // allocate output byte array - this could also be done without assembly
            // by using o_code = new bytes(size)
            o_code := mload(0x40)
            // new "memory end" including padding
            mstore(0x40, add(o_code, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            // store length in memory
            mstore(o_code, size)
            // actually retrieve the code, this needs assembly
            extcodecopy(_addr, add(o_code, 0x20), 0, size)
        }
    }
}

contract Enigma {
    using SafeMath for uint256;
    using ECRecovery for bytes32;

    struct Task {
        bytes32 callable;
        bytes32[] callableArgs;
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
        uint rate; // TODO: we don't want this
        uint status; // Uninitialized: 0; Inactive:1; Active: 2
    }

    address[] public workerIndex;
    mapping(address => Worker) public workers;
    mapping(address => Task[]) public tasks;

    event Register(bytes32 url, address user, string pkey, uint rate, bool _success);
    event Login(address user, bool _success);
    event Logout(address user, bool _success);
    event UpdateRate(address user, uint rate, bool _success);
    event Deposit(address secretContract, address user, uint amount, uint balance, bool _success);
    event Withdraw(address user, uint amount, uint balance, bool _success);
    event ValidateSig(bytes sig, bytes32 hash, address workerAddr, bool _success);
    event SolveTask(address secretContract, address worker, bytes sig, uint reward, bool _success);

    // Enigma computation task
    event ComputeTask(address callingContract, uint taskId, bytes32 callable, bytes32[] callableArgs, bytes32 callback, uint fee, bytes32[] preprocessors, bool _success);

    enum ReturnValue {Ok, Error}

//    function Enigma() public {
//
//    }

    modifier workerRegistered(address user) {
        Worker memory worker = workers[user];
        require(worker.status > 0, "Unregistered worker.");
        _;
    }

    function register(bytes32 url, string pkey, uint rate)
    public
    payable
    returns (ReturnValue) {
        // Register a new worker and deposit stake
        // require(workers[msg.sender].status == 0, "Worker already register.");

        workerIndex.push(msg.sender);

        workers[msg.sender].url = url;
        workers[msg.sender].pkey = pkey;
        workers[msg.sender].balance = msg.value;
        workers[msg.sender].rate = rate;
        workers[msg.sender].status = 1;

        emit Register(url, msg.sender, pkey, rate, true);

        return ReturnValue.Ok;
    }

    //TODO: we don't want this
    function login(string quote)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // The worker is ready to receive tasks

        // TODO: validate quote signature here
        workers[msg.sender].quote = quote;
        workers[msg.sender].status = 2;

        emit Login(msg.sender, true);

        return ReturnValue.Ok;
    }

    //TODO: we don't want this
    function logout()
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // A worker stops accepting tasks
        workers[msg.sender].status = 1;

        emit Logout(msg.sender, true);

        return ReturnValue.Ok;
    }

    //TODO: we don't want this
    function updateRate(uint rate)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Update the ENG/GAS rate
        workers[msg.sender].rate = rate;

        emit UpdateRate(msg.sender, rate, true);

        return ReturnValue.Ok;
    }

    //TODO: we don't want this
    function withdraw(uint amount)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Withdraw from stake and rewards balance
        Worker storage worker = workers[msg.sender];
        require(worker.balance > amount, "Not enough funds to withdraw.");

        worker.balance = worker.balance.sub(amount);
        msg.sender.transfer(amount);

        emit Withdraw(msg.sender, amount, worker.balance, true);

        return ReturnValue.Ok;
    }

    function compute(address secretContract, bytes32 callable, bytes32[] callableArgs, bytes32 callback, bytes32[] preprocessors)
    public
    payable
    returns (ReturnValue) {
        // Each task invoked by a contract has a sequential id
        uint taskId = tasks[secretContract].length;
        tasks[secretContract].length++;
        tasks[secretContract][taskId].reward = msg.value;
        tasks[secretContract][taskId].callable = callable;
        tasks[secretContract][taskId].callableArgs = callableArgs;
        tasks[secretContract][taskId].callback = callback;

        // Emit the ComputeTask event which each node is watching for
        emit ComputeTask(secretContract, taskId, callable, callableArgs, callback, msg.value, preprocessors, true);

        return ReturnValue.Ok;
    }

    function bytes32ArrayToBytes (bytes32[] data) returns (bytes) {
        // Merges parts of a bytes32[] into bytes
        // TODO: may be unsafe and suboptimal
        bytes memory bytesString = new bytes(data.length * 32);
        uint urlLength;
        for (uint i=0; i<data.length; i++) {
            for (uint j=0; j<32; j++) {
                byte char = byte(bytes32(uint(data[i]) * 2 ** (8 * j)));
                if (char != 0) {
                    bytesString[urlLength] = char;
                    urlLength += 1;
                }
            }
        }
        bytes memory bytesStringTrimmed = new bytes(urlLength);
        for (i=0; i<urlLength; i++) {
            bytesStringTrimmed[i] = bytesString[i];
        }
        return bytesStringTrimmed;
    }

    function verifySignature(address secretContract, Task task, bytes32[] results, bytes sig) internal constant
    returns (address) {
        // Recreating a data hash to validate the signature

        uint size = 1 + task.callableArgs.length + results.length;
        bytes32[] memory parts = new bytes32[](2);
        parts[0] = 'Test';
        parts[1] = 'Test';

        //uint offset = 1;
        //for(uint i1=0; i1 < task.callableArgs.length; i1++) {
        //    parts[offset] = task.callableArgs[i1];
        //    offset++;
        //}
        //for(uint i2=0; i2 < results.length; i2++) {
        //    parts[offset] = results[i2];
        //    offset++;
        //}

        // Build a hash to validate that the I/Os are matching
        bytes32 hash = keccak256(bytes32ArrayToBytes(parts));
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = sha3(prefix, hash);

        // TODO: this returns an address where we want to verify a public key
        // I don't believe that Solidity has a general purpose signature
        // validator. However, we know that an Ethereum address is the hash
        // of a public key, so we can use our public key to generate a
        // virtual address for validation.
        address workerAddr = prefixedHash.recover(sig);

        emit ValidateSig(sig, prefixedHash, workerAddr, true);
        return workerAddr;
    }

    // TODO: remove the hash parameter and recreate it in the function
    function solveTask(address secretContract, uint taskId, bytes32[] results, bytes sig)
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
        // tasks[secretContract][taskId].sig = sig;

        // Put the reward in the worker's bank
        // He can withdraw later
        Worker storage worker = workers[msg.sender];
        worker.balance = worker.balance.add(reward);

        emit SolveTask(secretContract, msg.sender, sig, reward, true);

        return ReturnValue.Ok;
    }
}
