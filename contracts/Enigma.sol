pragma solidity ^0.4.19;

contract SafeMath {
    function safeMul(uint a, uint b) internal returns (uint) {
        uint c = a * b;
        assert(a == 0 || c / a == b);
        return c;
    }

    function safeSub(uint a, uint b) internal returns (uint) {
        assert(b <= a);
        return a - b;
    }

    function safeAdd(uint a, uint b) internal returns (uint) {
        uint c = a + b;
        assert(c >= a && c >= b);
        return c;
    }

    function assert(bool assertion) internal {
        if (!assertion) throw;
    }
}

contract Enigma is SafeMath {
    struct Task {
        uint taskId;
        address worker;
        bytes32 proof;
        uint reward;
    }

    struct Worker {
        string pkey;
        string quote;
        uint balance;
        uint rate;
        uint status; // Uninitialized: 0; Inactive:1; Active: 2
    }

    address[] public workerIndex;
    mapping(address => Worker) public workers;
    mapping(address => Task[]) public tasks;

    event Register(address user, string pkey, uint rate, bool _success);
    event Login(address user, bool _success);
    event Logout(address user, bool _success);
    event UpdateRate(address user, uint rate, bool _success);
    event Deposit(address secretContract, address user, uint amount, uint balance, bool _success);
    event Withdraw(address user, uint amount, uint balance, bool _success);
    event SolveTask(address secretContract, address worker, bytes32 proof, uint reward, bool _success);

    // Enigma computation task
    event ComputeTask(address callingContract, uint taskId, bytes32 callable, bytes32[] callableArgs, bytes32 callback, uint max_fee, bool _success);

    enum ReturnValue {Ok, Error}

    function Enigma() public {

    }

    modifier workerRegistered(address user) {
        Worker memory worker = workers[user];
        require(worker.status > 0);
        _;
    }

    function register(string pkey, string quote, uint rate)
    public
    returns (ReturnValue) {
        // Register a new worker and collect stake
        require(workers[msg.sender].status == 0);

        workerIndex.push(msg.sender);

        workers[msg.sender].pkey = pkey;
        workers[msg.sender].quote = quote;
        workers[msg.sender].balance = msg.value;
        workers[msg.sender].rate = rate;
        workers[msg.sender].status = 1;

        Register(msg.sender, pkey, rate, true);

        return ReturnValue.Ok;
    }

    function login()
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // A worker accepts tasks
        workers[msg.sender].status = 2;

        Login(msg.sender, true);

        return ReturnValue.Ok;
    }

    function logout()
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // A worker stops accepting tasks
        workers[msg.sender].status = 1;

        Logout(msg.sender, true);

        return ReturnValue.Ok;
    }

    function updateRate(uint rate)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Update the ENG/GAS rate
        workers[msg.sender].rate = rate;

        UpdateRate(msg.sender, rate, true);

        return ReturnValue.Ok;
    }

    function withdraw(uint amount)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Withdraw from stake and rewards balance
        Worker storage worker = workers[msg.sender];
        require(worker.balance > amount);

        worker.balance = safeSub(worker.balance, amount);
        msg.sender.transfer(amount);

        Withdraw(msg.sender, amount, worker.balance, true);

        return ReturnValue.Ok;
    }

    function compute(address user, address secretContract, bytes32 callable, bytes32[] callableArgs, bytes32 callback)
    public
    payable
    returns (ReturnValue) {
        require(msg.value > 0);

        // Each task invoked by a contract has a sequential id
        uint taskId = tasks[secretContract].length;
        tasks[secretContract].length++;
        tasks[secretContract][taskId].reward = msg.value;

        // Emit the ComputeTask event which each node is watching for
        ComputeTask(secretContract, taskId, callable, callableArgs, callback, msg.value, true);

        return ReturnValue.Ok;
    }

    function solveTask(address secretContract, uint taskId, bytes32 proof)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Task must be solved only once
        require(tasks[secretContract][taskId].worker == address(0));

        // The contract must hold enough fund to distribute reward
        // TODO: validate that the reward matches the opcodes computed
        uint reward = tasks[secretContract][taskId].reward;
        require(reward > 0);

        // Keep a trace of the task worker and proof
        tasks[secretContract][taskId].worker = msg.sender;
        tasks[secretContract][taskId].proof = proof;

        // Put the reward in the worker's bank
        // He can withdraw later
        Worker storage worker = workers[msg.sender];
        worker.balance = safeAdd(worker.balance, reward);

        SolveTask(secretContract, msg.sender, proof, reward, true);

        return ReturnValue.Ok;
    }
}
