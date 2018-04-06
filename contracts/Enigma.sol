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

    struct SecretContract {
        bytes32 name;
        uint balance;
        Task[] tasks; // Computation hash mapped to fees
    }

    struct Worker {
        bytes32 pkey;
        bytes32 quote;
        uint balance;
        uint rate;
        uint status;
    }

    address[] _workerIndex;
    mapping(address => Worker) _workers;

    address[] _contractIndex;
    mapping(address => SecretContract) _secretContracts;

    event RegisterContract(address secretContract, bytes32 name, bool _success);
    event RegisterWorker(address user, bytes32 pkey, uint rate, bool _success);
    event UpdateRate(address user, uint rate, bool _success);
    event Deposit(address secretContract, address user, uint amount, uint balance, bool _success);
    event Withdraw(address user, uint amount, uint balance, bool _success);
    event SolveTask(address secretContract, address worker, bytes32 proof, uint reward, bool _success);

    // Enigma computation task
    event ComputeTask(address callingContract, uint taskId, bytes32 callable, bytes32[] callableArgs, bytes32 callback, uint max_fee, bool _success);

    enum ReturnValue {Ok, Error}

    function Enigma() public {

    }

    modifier contractRegistered(address secretContract) {
        SecretContract memory sc = _secretContracts[secretContract];
        require(sc.name != "");
        _;
    }

    modifier workerRegistered(address user) {
        Worker memory worker = _workers[user];
        require(worker.pkey != "");
        _;
    }

    function registerWorker(bytes32 pkey, bytes32 quote, uint rate)
    public
    returns (ReturnValue) {
        // Register a new worker and collect stake
        require(_workers[msg.sender].pkey == "");

        _workerIndex.push(msg.sender);

        _workers[msg.sender].pkey = pkey;
        _workers[msg.sender].quote = quote;
        _workers[msg.sender].balance = msg.value;
        _workers[msg.sender].rate = rate;
        _workers[msg.sender].status = 0;

        RegisterWorker(msg.sender, pkey, rate, true);

        return ReturnValue.Ok;
    }

    function login()
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // A worker accepts tasks
        _workers[msg.sender].status = 1;

        return ReturnValue.Ok;
    }

    function logout()
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // A worker stops accepting tasks
        _workers[msg.sender].status = 0;

        return ReturnValue.Ok;
    }

    function updateRate(uint rate)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Update the ENG/GAS rate
        require(_workers[msg.sender].pkey != "");

        _workers[msg.sender].rate = rate;

        UpdateRate(msg.sender, rate, true);

        return ReturnValue.Ok;
    }

    function registerContract(address secretContract, bytes32 name)
    public
    returns (ReturnValue) {
        // Register a secret contract
        require(_secretContracts[secretContract].name == "");

        _contractIndex.push(secretContract);

        _secretContracts[secretContract].name = name;
        _secretContracts[secretContract].balance = 0;

        RegisterContract(secretContract, name, true);

        return ReturnValue.Ok;
    }

    function deposit(address secretContract, uint amount)
    public
    payable
    contractRegistered(secretContract)
    returns (ReturnValue) {
        // Deposit tokens to a smart contract for computation
        require(msg.value > 0);

        SecretContract storage sc = _secretContracts[secretContract];
        sc.balance = safeAdd(sc.balance, amount);
        Deposit(secretContract, msg.sender, amount, sc.balance, true);

        return ReturnValue.Ok;
    }

    function withdraw(uint amount)
    public
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Withdraw from stake and rewards balance
        Worker storage worker = _workers[msg.sender];
        require(worker.balance > amount);

        worker.balance = safeSub(worker.balance, amount);
        msg.sender.transfer(amount);

        Withdraw(msg.sender, amount, worker.balance, true);

        return ReturnValue.Ok;
    }

    function compute(address user, address secretContract, bytes32 callable, bytes32[] callableArgs, bytes32 callback)
    public
    payable
    contractRegistered(secretContract)
    returns (ReturnValue) {
        require(msg.value > 0);

        // Each registered has a bank which holds computation deposits
        // Deposit fee amount in the specified contract bank
        SecretContract storage sc = _secretContracts[secretContract];
        sc.balance = safeAdd(sc.balance, msg.value);

        Deposit(secretContract, msg.sender, msg.value, sc.balance, true);

        // Each task invoked by a contract has a sequential id
        uint taskId = sc.tasks.length;
        sc.tasks.length++;

        // Emit the ComputeTask event which each node is watching for
        ComputeTask(secretContract, taskId, callable, callableArgs, callback, msg.value, true);

        return ReturnValue.Ok;
    }

    function solveTask(address secretContract, uint taskId, bytes32 proof, uint reward)
    public
    contractRegistered(secretContract)
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Record executed computation and distribute rewards
        SecretContract storage sc = _secretContracts[secretContract];
        // The contract must hold enough fund to distribute reward
        require(sc.balance > reward);
        // Task must be solved only once
        require(sc.tasks[taskId].worker == address(0));

        // Keep a trace of the task worker and proof
        sc.tasks[taskId].worker = msg.sender;
        sc.tasks[taskId].proof = proof;
        sc.tasks[taskId].reward = reward;

        // Put the reward in the worker's bank
        // He can withdraw later
        Worker storage worker = _workers[msg.sender];
        worker.balance = safeAdd(worker.balance, reward);

        SolveTask(secretContract, msg.sender, proof, reward, true);

        return ReturnValue.Ok;
    }

    ////////////////////////////////////////////////////////////////////////////////////////
    //VIEWS/////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////


    function listActiveWorkers() public view returns (address[]) {
        //Returns a list of all active workers
        address[] memory keys = new address[](_workerIndex.length);
        for (uint i = 0; i < _workerIndex.length; i++) {
            // Filter out inactive workers
            Worker memory worker = _workers[_workerIndex[i]];
            if (worker.pkey != "") {
                keys[i] = _workerIndex[i];
            }
        }
        return keys;
    }

    function getWorkerData(address user)
    public
    view
    workerRegistered(msg.sender)
    returns (bytes32[4]){
        // Returns data about the specified worker
        Worker memory worker = _workers[user];

        bytes32 strBalance = bytes32(worker.balance);
        bytes32 strRate = bytes32(worker.rate);

        return [worker.pkey, worker.quote, strBalance, strRate];
    }
}
