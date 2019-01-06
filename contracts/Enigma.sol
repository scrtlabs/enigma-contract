pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

contract ERC20 {
    function allowance(address owner, address spender) public view returns (uint256);

    function transferFrom(address from, address to, uint256 value) public returns (bool);

    function approve(address spender, uint256 value) public returns (bool);

    function totalSupply() public view returns (uint256);

    function balanceOf(address who) public view returns (uint256);

    function transfer(address to, uint256 value) public returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

contract Enigma {
    using SafeMath for uint256;
    using ECDSA for bytes32;

    // ========================================== Structs ==========================================

    struct TaskRecord {
        uint fee; // ENG fee in grains (10 ** 8) amount
        bytes proof; // Signature of (taskId, inStateDeltaHash, outStateDeltaHash, ethCall)
        address sender; // Sender of TaskRecord
        uint blockNumber; // Block number TaskRecord was mined
        TaskStatus status; // RecordUndefined: 0; RecordCreated: 1; ReceiptVerified: 2
    }

    struct Worker {
        address signer; // Enclave address
        WorkerStatus status; // Unregistered: 0, Registered: 1, LoggedIn: 2, LoggedOut: 3
        bytes report; // Decided to store this as one  RLP encoded attribute for easier external storage in the future
        uint256 balance; // ENG balance
    }

    /**
    * The data representation of the worker parameters used as input for
    * the worker selection algorithm
    */
    struct WorkersParams {
        uint firstBlockNumber;
        address[] workers;
        uint[] balances;
        uint seed;
        uint nonce;
    }

    struct SecretContract {
        address owner; // Owner who deployed secret contract
        bytes32 preCodeHash; // Predeployed bytecode hash
        bytes32 codeHash; // Deployed bytecode hash
        bytes32[] stateDeltaHashes;
        SecretContractStatus status; // Undefined: 0, Deployed: 1
        // TODO: consider keeping an index of taskIds
    }

    // ========================================== Enums ==========================================

    enum TaskStatus {RecordUndefined, RecordCreated, ReceiptVerified}

    enum WorkerStatus {Unregistered, Registered, LoggedIn, LoggedOut}

    enum SecretContractStatus {Undefined, Deployed}

    // ========================================== Events ==========================================

    event Registered(address custodian, address signer);
    event ValidatedSig(bytes sig, bytes32 hash, address workerAddr);
    event WorkersParameterized(uint seed, uint256 blockNumber, address[] workers, uint[] balances, uint nonce);
    event TaskRecordCreated(bytes32 taskId, uint fee, address sender);
    event TaskRecordsCreated(bytes32[] taskIds, uint[] fees, address sender);
    event ReceiptVerified(bytes32 taskId, bytes32 inStateDeltaHash, bytes32 outStateDeltaHash, bytes ethCall, bytes sig);
    event ReceiptsVerified(bytes32[] taskIds, bytes32[] inStateDeltaHashes, bytes32[] outStateDeltaHashes, bytes ethCall, bytes sig);
    event DepositSuccessful(address from, uint value);
    event SecretContractDeployed(bytes32 scAddr, bytes32 codeHash);

    // ========================================== State Variables ==========================================

    // The interface of the deployed ENG ERC20 token contract
    ERC20 public engToken;

    // Epoch size in number of blocks
    uint public epochSize = 100;

    /**
    * The signer address of the principal node
    * This must be set when deploying the contract and remains immutable
    * Since the signer address is derived from the public key of an
    * SGX enclave, this ensures that the principal node cannot be tempered
    * with or replaced.
    */
    address principal;

    /**
    * The last 5 worker parameters
    * We keep a collection of worker parameters to account for latency issues.
    * A computation task might be conceivably given out at a certain block number
    * but executed at a later block in a different epoch. It follows that
    * the contract must have access to the worker parameters effective when giving
    * out the task, otherwise the selected worker would not match. We calculated
    * that keeping the last 5 items should be more than enough to account for
    * all latent tasks. Tasks results will be rejected past this limit.
    */
    WorkersParams[5] workersParams;

    // An address-based index of all registered worker
    address[] public workerAddresses;
    // An address-based index of all secret contracts
    bytes32[] public scAddresses;

    // A registry of all registered workers with their attributes
    mapping(address => Worker) public workers;

    // A registry of all tasks with their attributes
    mapping(bytes32 => TaskRecord) public tasks;

    // A registry of all deployed secret contracts with their attributes
    mapping(bytes32 => SecretContract) public contracts;

    // A mapping of number of tasks deployed for each address
    mapping(address => uint) public userTaskDeployments;

    // TODO: do we keep tasks forever? if not, when do we delete them?
    uint stakingThreshold;
    uint public workerGroupSize;

    // ========================================== Constructor ==========================================

    constructor(address _tokenAddress, address _principal) public {
        engToken = ERC20(_tokenAddress);
        principal = _principal;
        stakingThreshold = 1;
        workerGroupSize = 5;
    }

    //TODO: break down these methods into services for upgradability

    // ========================================== Modifiers ==========================================

    /**
    * Checks if the custodian wallet is registered as a worker
    *
    * @param _user The custodian address of the worker
    */
    modifier workerRegistered(address _user) {
        Worker memory worker = workers[_user];
        require(worker.status != WorkerStatus.Unregistered, "Unregistered worker.");
        _;
    }

    /**
    * Checks if the custodian wallet is logged in as a worker
    *
    * @param _user The custodian address of the worker
    */
    modifier workerLoggedIn(address _user) {
        Worker memory worker = workers[_user];
        require(worker.status == WorkerStatus.LoggedIn, "Worker not logged in.");
        _;
    }

    /**
    * Checks secret contract has been deployed
    *
    * @param _scAddr Secret contract address
    */
    modifier contractDeployed(bytes32 _scAddr) {
        require(contracts[_scAddr].status == SecretContractStatus.Deployed, "Secret contract not deployed.");
        _;
    }

    // ========================================== Functions ==========================================

    /**
    * Registers a new worker of change the signer parameters of an existing
    * worker. This should be called by every worker (and the principal)
    * node in order to receive tasks.
    *
    * @param _signer The signer address, derived from the enclave public key
    * @param _report The RLP encoded report returned by the IAS
    */
    function register(address _signer, bytes memory _report)
    public
    {
        // TODO: consider exit if both signer and custodian as matching
        // If the custodian is not already register, we add an index entry
        if (workers[msg.sender].signer == address(0)) {
            workerAddresses.push(msg.sender);
        }

        // Set the custodian attributes
        workers[msg.sender].signer = _signer;
        workers[msg.sender].balance = 0;
        workers[msg.sender].report = _report;
        workers[msg.sender].status = WorkerStatus.Registered;

        emit Registered(msg.sender, _signer);
    }

    /**
    * Deposits ENG stake into contract from worker. Worker must be registered to do so.
    *
    * @param _custodian The worker's ETH address
    * @param _amount The amount of ENG, in grains format (10 ** 8), to deposit
    */
    function deposit(address _custodian, uint _amount)
    public
    workerRegistered(_custodian)
    {
        require(engToken.allowance(_custodian, address(this)) >= _amount, "Not enough tokens allowed for transfer");
        require(engToken.transferFrom(_custodian, address(this), _amount));

        workers[_custodian].balance = workers[_custodian].balance.add(_amount);

        emit DepositSuccessful(_custodian, _amount);
    }

    /**
    * Login worker. Worker must be registered to do so, and must be logged in at start of epoch to be part of worker
    * selection process.
    */
    function login() public workerRegistered(msg.sender) {
        workers[msg.sender].status = WorkerStatus.LoggedIn;
    }

    /**
    * Logout worker. Worker must be logged in to do so.
    */
    function logout() public workerLoggedIn(msg.sender) {
        workers[msg.sender].status = WorkerStatus.LoggedOut;
    }

    /**
    * Deploy secret contract from user, called by the worker.
    *
    * @param _scAddr Secret contract address
    * @param _preCodeHash Predeployed bytecode hash
    * @param _codeHash Deployed bytecode hash
    * @param _owner ETH address for user who initially deployed the secret contract task
    * @param _sig Worker's signature for deployment
    */
    function deploySecretContract(bytes32 _scAddr, bytes32 _preCodeHash, bytes32 _codeHash,
        address _owner, bytes memory _sig)
    public
    workerLoggedIn(msg.sender)
    {
        // Secret contract must not have been deployed yet
        require(contracts[_scAddr].status == SecretContractStatus.Undefined, "Secret contract already deployed.");

        // We can index into tasks with secret contract address since for contract deployment tasks, scAddr == taskId
        // Must be a task record corresponding to this deployment task
        require(tasks[_scAddr].status == TaskStatus.RecordCreated, "Invalid task status");

        // Owner must be the same as the corresponding task record's owner
        require(tasks[_scAddr].sender == _owner, "Invalid sender");

        // Worker deploying task must be the appropriate worker as per the worker selection algorithm
        address selectedWorker = getWorkerGroup(tasks[_scAddr].blockNumber, _scAddr)[0];
        require(msg.sender == selectedWorker, "Not the selected worker for this task");

        // Verify the worker's signature
        bytes32 msgHash = keccak256(abi.encodePacked(_scAddr, _codeHash));
        address verifySigner = msgHash.recover(_sig);
        require(verifySigner == workers[msg.sender].signer, "Invalid signature.");

        // Set the secret contract's attributes in registry
        contracts[_scAddr].owner = _owner;
        contracts[_scAddr].preCodeHash = _preCodeHash;
        contracts[_scAddr].codeHash = _codeHash;
        contracts[_scAddr].status = SecretContractStatus.Deployed;
        scAddresses.push(_scAddr);

        // Finalize task record for deployment task
        tasks[_scAddr].proof = _sig;
        tasks[_scAddr].status = TaskStatus.ReceiptVerified;

        // Credit worker with th efees associated with this deployment task
        workers[msg.sender].balance = workers[msg.sender].balance.add(tasks[_scAddr].fee);

        emit SecretContractDeployed(_scAddr, _codeHash);
    }

    /**
    * Check if secret contract has been deployed
    *
    * @param _scAddr Secret contract address
    * @return  true/false
    */
    function isDeployed(bytes32 _scAddr)
    public
    view
    returns (bool)
    {
        if (contracts[_scAddr].status == SecretContractStatus.Deployed) {
            return true;
        } else {
            return false;
        }
    }

    /**
    * Check if secret contract has been deployed
    *
    * @return  Number of deployed secret contracts
    */
    function countSecretContracts()
    public
    view
    returns (uint)
    {
        return scAddresses.length;
    }

    /**
    * Get deployed secret contract addresses within a range
    *
    * @param _start Start of range
    * @param _stop End of range
    * @return Subset of deployed secret contract addresses
    */
    function getSecretContractAddresses(uint _start, uint _stop)
    public
    view
    returns (bytes32[] memory)
    {
        if (_stop == 0) {
            _stop = scAddresses.length;
        }
        bytes32[] memory addresses = new bytes32[](_stop.sub(_start));
        uint pos = 0;
        for (uint i = _start; i < _stop; i++) {
            addresses[pos] = scAddresses[i];
            pos++;
        }
        return addresses;
    }

    /**
    * Count state deltas for a deployed secret contract
    *
    * @param _scAddr Secret contract address
    * @return Number of state deltas for deployed secret contract
    */
    function countStateDeltas(bytes32 _scAddr)
    public
    view
    contractDeployed(_scAddr)
    returns (uint)
    {
        return contracts[_scAddr].stateDeltaHashes.length;
    }

    /**
    * Obtain state delta hash for a deployed secret contract at a particular index
    *
    * @param _scAddr Secret contract address
    * @param _index Index in list of state deltas
    * @return State delta hash
    */
    function getStateDeltaHash(bytes32 _scAddr, uint _index)
    public
    view
    contractDeployed(_scAddr)
    returns (bytes32)
    {
        return contracts[_scAddr].stateDeltaHashes[_index];
    }

    /**
    * Obtain state delta hashes for a deployed secret contract within a range
    *
    * @param _start Start of range
    * @param _stop End of range
    * @return Subset of state delta hashes for deployed secret contract
    */
    function getStateDeltaHashes(bytes32 _scAddr, uint _start, uint _stop)
    public
    view
    contractDeployed(_scAddr)
    returns (bytes32[] memory)
    {
        if (_stop == 0) {
            _stop = contracts[_scAddr].stateDeltaHashes.length;
        }
        bytes32[] memory deltas = new bytes32[](_stop.sub(_start));
        uint pos = 0;
        for (uint i = _start; i < _stop; i++) {
            deltas[pos] = contracts[_scAddr].stateDeltaHashes[i];
            pos++;
        }
        return deltas;
    }

    /**
    * Check if particular state delta hash for a deployed secret contract is valid
    *
    * @param _scAddr Secret contract address
    * @param _stateDeltaHash State delta hash
    * @return true/false
    */
    function isValidDeltaHash(bytes32 _scAddr, bytes32 _stateDeltaHash)
    public
    view
    contractDeployed(_scAddr)
    returns (bool)
    {
        bool valid = false;
        for (uint i = 0; i < contracts[_scAddr].stateDeltaHashes.length; i++) {
            if (contracts[_scAddr].stateDeltaHashes[i] == _stateDeltaHash) {
                valid = true;
                break;
            }
        }
        return valid;
    }

    /**
    * Create task record for task (either contract deployment or regular task). This is necessary for
    * transferring task fee from sender to contract, generating the unique taskId, saving the block number
    * when the record was mined, and incrementing the user's task deployment counter nonce.
    *
    * @param _taskIdInputHash Hash of function name, ABI-encoded args, and user's public key
    * @param _fee ENG fee
    */
    function createTaskRecord(
        bytes32 _taskIdInputHash,
        uint _fee
    )
    public
    {
        require(engToken.allowance(msg.sender, address(this)) >= _fee, "Allowance not enough");
        require(engToken.transferFrom(msg.sender, address(this), _fee), "Transfer not valid");

        // Create taskId
        bytes32 taskId = keccak256(abi.encodePacked(_taskIdInputHash, userTaskDeployments[msg.sender]));
        require(tasks[taskId].sender == address(0), "Task already exists.");

        tasks[taskId].fee = _fee;
        tasks[taskId].sender = msg.sender;
        tasks[taskId].blockNumber = block.number;
        tasks[taskId].status = TaskStatus.RecordCreated;

        userTaskDeployments[msg.sender]++;

        emit TaskRecordCreated(taskId, _fee, msg.sender);
    }

    /**
    * Create task records for tasks (either contract deployment or regular tasks). This is necessary for
    * transferring task fee from sender to contract, generating the unique taskId, saving the block number
    * when the record was mined, and incrementing the user's task deployment counter nonce.
    *
    * @param _taskIdInputHashes Hashes of function name, ABI-encoded args, and user's public key
    * @param _fees ENG fees
    */
    function createTaskRecords(
        bytes32[] memory _taskIdInputHashes,
        uint[] memory _fees
    )
    public
    {
        bytes32[] memory taskIds = new bytes32[](_taskIdInputHashes.length);
        for (uint i = 0; i < _taskIdInputHashes.length; i++) {
            require(engToken.allowance(msg.sender, address(this)) >= _fees[i], "Allowance not enough");
            require(engToken.transferFrom(msg.sender, address(this), _fees[i]), "Transfer not valid");

            bytes32 taskId = keccak256(abi.encodePacked(_taskIdInputHashes[i], userTaskDeployments[msg.sender]));
            require(tasks[taskId].sender == address(0), "Task already exist.");
            taskIds[i] = taskId;

            tasks[taskId].fee = _fees[i];
            tasks[taskId].sender = msg.sender;
            tasks[taskId].blockNumber = block.number;
            tasks[taskId].status = TaskStatus.RecordCreated;

            userTaskDeployments[msg.sender]++;
        }
        emit TaskRecordsCreated(taskIds, _fees, msg.sender);
    }

    // Execute the encoded function in the specified contract
    function executeCall(address _to, uint256 _value, bytes memory _data)
    internal
    returns (bool success)
    {
        assembly {
            success := call(gas, _to, _value, add(_data, 0x20), mload(_data), 0, 0)
        }
    }

    /**
    * After verifying that the record for which the worker is committing a receipt has been created and that the input
    * state delta hash checks out, append the output state delta hash to the list of state deltas.
    *
    * @param _scAddr Secret contract address
    * @param _taskId Unique taskId
    * @param _inStateDeltaHash Input state delta hash
    * @param _outStateDeltaHash Output state delta hash
    */
    function verifyReceipt(
        bytes32 _scAddr,
        bytes32 _taskId,
        bytes32 _inStateDeltaHash,
        bytes32 _outStateDeltaHash
    )
    internal
    {
        require(tasks[_taskId].status == TaskStatus.RecordCreated, 'Invalid task status');
        uint index = contracts[_scAddr].stateDeltaHashes.length;
        if (index == 0) {
            require(_inStateDeltaHash == 0x0, 'Invalid input state delta hash for empty state');
        } else {
            require(_inStateDeltaHash == contracts[_scAddr].stateDeltaHashes[index.sub(1)], 'Invalid input state delta hash');
        }
        contracts[_scAddr].stateDeltaHashes.push(_outStateDeltaHash);
        // TODO: execute the Ethereum calls
    }

    /**
    * Commit the computation task results on chain by first verifying the receipt and then the worker's signature.
    * After this, the task record is finalized and the worker is credited with the task's fee.
    *
    * @param _scAddr Secret contract address
    * @param _taskId Unique taskId
    * @param _inStateDeltaHash Input state delta hash
    * @param _outStateDeltaHash Output state delta hash
    * @param _ethCall Eth call
    * @param _sig Worker's signature
    */
    function commitReceipt(
        bytes32 _scAddr,
        bytes32 _taskId,
        bytes32 _inStateDeltaHash,
        bytes32 _outStateDeltaHash,
        bytes memory _ethCall,
        bytes memory _sig
    )
    public
    workerLoggedIn(msg.sender)
    contractDeployed(_scAddr)
    {
        verifyReceipt(_scAddr, _taskId, _inStateDeltaHash, _outStateDeltaHash);
        bytes32 hash = keccak256(abi.encodePacked(_taskId, _inStateDeltaHash, _outStateDeltaHash, _ethCall));
        address workerAddr = hash.recover(_sig);
        require(workerAddr == workers[msg.sender].signer, "Invalid signature.");
        tasks[_taskId].proof = _sig;
        tasks[_taskId].status = TaskStatus.ReceiptVerified;
        workers[msg.sender].balance = workers[msg.sender].balance.add(tasks[_taskId].fee);
        emit ReceiptVerified(_taskId, _inStateDeltaHash, _outStateDeltaHash, _ethCall, _sig);
    }

    /**
   * Commit the computation task results on chain by first verifying the receipts and then the worker's signature.
   * After this, the task records are finalized and the worker is credited with the tasks' fees.
   *
   * @param _scAddr Secret contract address
   * @param _taskIds Unique taskId
   * @param _inStateDeltaHashes Input state delta hash
   * @param _outStateDeltaHashes Output state delta hash
   * @param _ethCall Eth call
   * @param _sig Worker's signature
   */
    function commitReceipts(
        bytes32 _scAddr,
        bytes32[] memory _taskIds,
        bytes32[] memory _inStateDeltaHashes,
        bytes32[] memory _outStateDeltaHashes,
        bytes memory _ethCall,
        bytes memory _sig
    )
    public
    workerLoggedIn(msg.sender)
    contractDeployed(_scAddr)
    {
        for (uint i = 0; i < _taskIds.length; i++) {
            verifyReceipt(_scAddr, _taskIds[i], _inStateDeltaHashes[i], _outStateDeltaHashes[i]);
        }
        bytes32 hash = keccak256(abi.encodePacked(_taskIds, _inStateDeltaHashes, _outStateDeltaHashes, _ethCall));
        address workerAddr = hash.recover(_sig);
        require(workerAddr == workers[msg.sender].signer, "Invalid signature.");
        for (uint ic = 0; ic < _taskIds.length; ic++) {
            tasks[_taskIds[ic]].proof = _sig;
            tasks[_taskIds[ic]].status = TaskStatus.ReceiptVerified;
            workers[msg.sender].balance = workers[msg.sender].balance.add(tasks[_taskIds[ic]].fee);
        }
        emit ReceiptsVerified(_taskIds, _inStateDeltaHashes, _outStateDeltaHashes, _ethCall, _sig);
    }

    // Verify the signature submitted while reparameterizing workers
    function verifyParamsSig(uint256 _seed, bytes memory _sig)
    internal
    pure
    returns (address)
    {
        bytes32 hash = keccak256(abi.encodePacked(_seed));
        address signer = hash.recover(_sig);
        return signer;
    }

    /**
    * Reparameterizing workers with a new seed
    * This should be called for each epoch by the Principal node
    *
    * @param _seed The random integer generated by the enclave
    * @param _sig The random integer signed by the the principal node's enclave
    */
    function setWorkersParams(uint _seed, bytes memory _sig)
    public
    workerRegistered(msg.sender)
    {
        // Reparameterizing workers with a new seed
        // This should be called for each epoch by the Principal node

        // We assume that the Principal is always the first registered node
        require(workers[msg.sender].signer == principal, "Only the Principal can update the seed");
        // TODO: verify the principal sig

        // Create a new workers parameters item for the specified seed.
        // The workers parameters list is a sort of cache, it never grows beyond its limit.
        // If the list is full, the new item will replace the item assigned to the lowest block number.
        uint paramIndex = 0;
        for (uint pi = 0; pi < workersParams.length; pi++) {
            // Find an empty slot in the array, if full use the lowest block number
            if (workersParams[pi].firstBlockNumber == 0) {
                paramIndex = pi;
                break;
            } else if (workersParams[pi].firstBlockNumber < workersParams[paramIndex].firstBlockNumber) {
                paramIndex = pi;
            }
        }
        workersParams[paramIndex].firstBlockNumber = block.number;
        workersParams[paramIndex].seed = _seed;
        workersParams[paramIndex].nonce = userTaskDeployments[msg.sender];

        // Copy the current worker list
        uint workerIndex = 0;
        for (uint wi = 0; wi < workerAddresses.length; wi++) {
            Worker memory worker = workers[workerAddresses[wi]];
            if ((worker.balance >= stakingThreshold) && (worker.signer != principal) &&
                (worker.status == WorkerStatus.LoggedIn)) {
                workersParams[paramIndex].workers.length++;
                workersParams[paramIndex].workers[workerIndex] = workerAddresses[wi];

                workersParams[paramIndex].balances.length++;
                workersParams[paramIndex].balances[workerIndex] = worker.balance;

                workerIndex = workerIndex.add(1);
            }
        }
        emit WorkersParameterized(_seed, block.number, workersParams[paramIndex].workers,
            workersParams[paramIndex].balances, userTaskDeployments[msg.sender]);
        userTaskDeployments[msg.sender]++;
    }

    function getWorkerParamsIndex(uint _blockNumber)
    internal
    view
    returns (uint)
    {
        // The workers parameters for a given block number
        int8 index = - 1;
        for (uint i = 0; i < workersParams.length; i++) {
            if (workersParams[i].firstBlockNumber <= _blockNumber && (index == - 1 || workersParams[i].firstBlockNumber > workersParams[uint(index)].firstBlockNumber)) {
                index = int8(i);
            }
        }
        require(index != - 1, "No workers parameters entry for specified block number");
        return uint(index);
    }

    function getWorkerParams(uint _blockNumber)
    public
    view
    returns (uint, uint, address[] memory, uint[] memory) {
        uint index = getWorkerParamsIndex(_blockNumber);
        WorkersParams memory params = workersParams[index];
        return (params.firstBlockNumber, params.seed, params.workers, params.balances);
    }

    /**
    * Select a worker for the computation task pseudorandomly based on the epoch, secret contract address, and nonce
    *
    * @param _paramIndex Param index
    * @param _scAddr Secret contract address
    * @param _nonce Counter
    * @return Selected worker's address
    */
    function selectWeightedRandomWorker(uint _paramIndex, bytes32 _scAddr, uint _nonce)
    internal
    view
    returns (address)
    {
        WorkersParams memory params = workersParams[_paramIndex];
        uint tokenCpt = 0;
        for (uint i = 0; i < params.workers.length; i++) {
            if (params.workers[i] != address(0)) {
                tokenCpt = tokenCpt.add(params.balances[i]);
            }
        }
        bytes32 randHash = keccak256(abi.encodePacked(params.seed, _scAddr, _nonce));
        int randVal = int256(uint256(randHash) % tokenCpt);
        for (uint k = 0; k < params.workers.length; k++) {
            if (params.workers[k] != address(0)) {
                randVal -= int256(params.balances[k]);
                if (randVal <= 0) {
                    return params.workers[k];
                }
            }
        }
        return params.workers[params.workers.length - 1];
    }

    /**
    * Select a group of workers for the computation task given the block number of the task record (implies the epoch)
    * and the secret contract address.
    *
    * @param _blockNumber Block number the task record was mined
    * @param _scAddr Secret contract address
    * @return Selected workers' addresses
    */
    function getWorkerGroup(uint _blockNumber, bytes32 _scAddr)
    public
    view
    returns (address[] memory)
    {
        // Compile a list of selected workers for the block number and
        // secret contract.
        uint paramIndex = getWorkerParamsIndex(_blockNumber);

        address[] memory selectedWorkers = new address[](workerGroupSize);
        uint nonce = 0;
        for (uint it = 0; it < workerGroupSize; it++) {
            do {
                address worker = selectWeightedRandomWorker(paramIndex, _scAddr, nonce);
                bool dup = false;
                for (uint id = 0; id < selectedWorkers.length; id++) {
                    if (worker == selectedWorkers[id]) {
                        dup = true;
                        break;
                    }
                }
                if (dup == false) {
                    selectedWorkers[it] = worker;
                }
                nonce++;
            }
            while (selectedWorkers[it] == address(0));
        }
        return selectedWorkers;
    }

    /**
    * The worker parameters corresponding to the specified block number
    *
    * @param _blockNumber The reference block number
    */
    function getWorkersParams(uint _blockNumber)
    public
    view
    returns (uint, uint, address[] memory, address[] memory)
    {
        // TODO: finalize implementation
        uint firstBlockNumber = 0;
        uint seed = 0;
        address[] memory activeWorkers;
        address[] memory activeContracts;
        return (firstBlockNumber, seed, activeWorkers, activeContracts);
    }

    /**
    * The RLP encoded report returned by the IAS server
    *
    * @param _custodian The worker's custodian address
    */
    function getReport(address _custodian)
    public
    view
    workerRegistered(_custodian)
    returns (address, bytes memory)
    {
        // The RLP encoded report and signer's address for the specified worker
        require(workers[_custodian].signer != address(0), "Worker not registered");
        return (workers[_custodian].signer, workers[_custodian].report);
    }
}
