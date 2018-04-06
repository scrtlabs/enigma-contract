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
    struct Computation {
        address worker;
        bytes32 proof;
        uint reward;
    }

    struct SecretContract {
        bytes32 name;
        uint balance;
        mapping(address => Computation) computations; // Computation hash mapped to fees
    }

    struct Worker {
        bytes32 pkey;
        bytes32 quote;
        uint balance;
        uint rate;
        uint reward;
    }

    mapping(address => Worker) _workers;
    mapping(address => SecretContract) _secretContracts;

    mapping(address => uint) _bank;
    mapping(address => uint) public _validators; // funds assigned to validators

    event RegisterContract(address secretContract, bytes32 name, bool _success);
    event RegisterWorker(address user, bytes32 pkey, uint rate, bool _success);
    event UpdateRate(address user, uint rate, bool _success);

    event Register(address secretContract, bytes32 name, bool _success);
    event Deposit(address secretContract, address user, uint amount, uint balance, bool _success);
    event Withdraw(address user, uint amount, uint balance, bool _success);
    event ApplyComputation(address secretContract, address worker, bytes32 proof, uint reward, bool _success);

    enum ReturnValue {Ok, Error}

    function Enigma() public {

    }

    function registerWorker(address user, bytes32 pkey, bytes32 quote, uint rate) {
        // Register a new worker and collect stake
        require(_workers[user] == "");

        _workers[user].pkey = pkey;
        _workers[user].quote = quote;
        _workers[user].balance = msg.value;
        _workers[user].rate = rate;

        RegisterWorker(user, pkey, rate, true);
    }

    function updateRate(address user, uint rate) {
        // Update the ENG/GAS rate
        require(_workers[user] != "");

        _workers[user].rate = rate;

        UpdateRate(user, rate, true);
    }

    function registerContract(address secretContract, bytes32 name) {
        // Register a secret contract
        require(_secretContracts[secretContract].name == "");

        _secretContracts[secretContract].name = name;
        _secretContracts[secretContract].balance = 0;

        RegisterContract(secretContract, name, true);
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

    function deposit(address secretContract)
    public
    payable
    contractRegistered(secretContract)
    returns (ReturnValue) {
        // Deposit tokens to a smart contract for computation
        require(msg.value > 0);

        SecretContract storage sc = _secretContracts[secretContract];
        sc.balance[token] = safeAdd(sc.balance[token], msg.value);
        Deposit(secretContract, msg.sender, msg.value, sc.balance[token], true);
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

        Withdraw(msg.sender, amount, worker.balance[token], true);
    }


    function applyComputation(address secretContract, bytes32 proof, uint reward)
    public
    contractRegistered(secretContract)
    workerRegistered(msg.sender)
    returns (ReturnValue) {
        // Record executed computation and distribute rewards
        SecretContract storage sc = _secretContracts[secretContract];
        Worker storage worker = _workers[msg.sender];

        require(sc.balance > reward);

        sc.computations[secretContract].worker = msg.sender;
        sc.computations[secretContract].proof = proof;
        sc.computations[secretContract].reward = reward;

        worker.balance = safeAdd(worker.balance, reward);

        ApplyComputation(secretContract, msg.sender, proof, reward, true);
    }
}
