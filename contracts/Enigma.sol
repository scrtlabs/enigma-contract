pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "./EnigmaToken.sol";


contract Enigma {
    using SafeMath for uint256;
    using ECRecovery for bytes32;

    // The interface of the deployed ENG ERC20 token contract
    EnigmaToken public engToken;

    struct TaskRecord {
        bytes32 taskId;
        uint fee;
        address token;
        uint tokenValue;
        address sender;
    }

    struct TaskReceipt {
        bytes32 taskId;
        bytes32 inStateDeltaHash;
        bytes32 outStateDeltaHash;
        bytes ethCall;
        bytes sig;
    }

    struct Task {
        uint fee;
        address token;
        uint tokenValue;
        bytes proof; // Signature of (taskId, inStateDeltaHash, outStateDeltaHash, ethCall)
        address sender;
        TaskStatus status;
    }
    enum TaskStatus {RecordCreated, ReceiptVerified}

    /**
    * The signer address of the principal node
    * This must be set when deploying the contract and remains immutable
    * Since the signer address is derived from the public key of an
    * SGX enclave, this ensures that the principal node cannot be tempered
    * with or replaced.
    */
    address principal;

    // The data representation of a worker (or node)
    struct Worker {
        address signer;
        uint8 status; // Uninitialized: 0; Active: 1; Inactive: 2
        bytes report; // Decided to store this as one  RLP encoded attribute for easier external storage in the future
        uint256 balance;
    }

    /**
    * The data representation of the worker parameters used as input for
    * the worker selection algorithm
    */
    struct WorkersParams {
        uint256 firstBlockNumber;
        mapping(address => uint) workerWeights;
        uint256 seed;
    }

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

    // A registry of all registered workers with their attributes
    mapping(address => Worker) public workers;
    // A registry of all active and historical tasks with their attributes
    // TODO: do we keep tasks forever? if not, when do we delete them?
    mapping(bytes32 => Task) public tasks;
    mapping(address => bytes32[]) public stateDeltaHashes;

    // The events emitted by the contract
    event Registered(address custodian, address signer);
    event ValidatedSig(bytes sig, bytes32 hash, address workerAddr);
    event WorkersParameterized(uint256 seed, address[] workers, address[] secretContracts);
    event TaskRecordCreated(bytes32 taskId, uint fee, address token, uint tokenValue, address sender);
    event TaskRecordsCreated(bytes32[] taskIds, uint[] fees, address[] tokens, uint[] tokenValues, address sender);
    event ReceiptVerified(bytes32 taskId, bytes32 inStateDeltaHash, bytes32 outStateDeltaHash, bytes ethCall, bytes sig);
    event ReceiptsVerified(bytes32[] taskIds, bytes32[] inStateDeltaHashes, bytes32[] outStateDeltaHashes, bytes[] ethCalls, bytes[] sigs);

    constructor(address _tokenAddress, address _principal) public {
        engToken = EnigmaToken(_tokenAddress);
        principal = _principal;
    }

    /**
    * Checks if the custodian wallet is registered as a worker
    *
    * @param user The custodian address of the worker
    */
    modifier workerRegistered(address user) {
        Worker memory worker = workers[user];
        require(worker.status > 0, "Unregistered worker.");
        _;
    }

    /**
    * Registers a new worker of change the signer parameters of an existing
    * worker. This should be called by every worker (and the principal)
    * node in order to receive tasks.
    *
    * @param signer The signer address, derived from the enclave public key
    * @param report The RLP encoded report returned by the IAS
    */
    function register(address signer, bytes report)
    public
    payable
    {
        // TODO: consider exit if both signer and custodian as matching
        // If the custodian is not already register, we add an index entry
        if (workers[msg.sender].signer == 0x0) {
            uint index = workerAddresses.length;
            workerAddresses.length++;
            workerAddresses[index] = msg.sender;
        }

        // Set the custodian attributes
        workers[msg.sender].signer = signer;
        workers[msg.sender].balance = msg.value;
        workers[msg.sender].report = report;
        workers[msg.sender].status = 1;

        emit Registered(msg.sender, signer);
    }

    /**
    * Store task record
    *
    */
    function createTaskRecord(
        bytes32 taskId,
        uint fee,
        address token,
        uint tokenValue
    )
    public
    {
        require(tasks[taskId].sender == 0x0, "Task already exist.");

        tasks[taskId].fee = fee;
        tasks[taskId].token = token;
        tasks[taskId].tokenValue = tokenValue;
        tasks[taskId].sender = msg.sender;
        tasks[taskId].status = TaskStatus.RecordCreated;

        emit TaskRecordCreated(taskId, fee, token, tokenValue, msg.sender);
    }

    function createTaskRecords(
        bytes32[] taskIds,
        uint[] fees,
        address[] tokens,
        uint[] tokenValues
    )
    public
    {
        for (uint i = 0; i < taskIds.length; i++) {
            require(tasks[taskIds[i]].sender == 0x0, "Task already exist.");

            tasks[taskIds[i]].fee = fees[i];
            tasks[taskIds[i]].token = tokens[i];
            tasks[taskIds[i]].tokenValue = tokenValues[i];
            tasks[taskIds[i]].sender = msg.sender;
            tasks[taskIds[i]].status = TaskStatus.RecordCreated;
        }
        emit TaskRecordsCreated(taskIds, fees, tokens, tokenValues, msg.sender);
    }

    // Execute the encoded function in the specified contract
    function executeCall(address to, uint256 value, bytes data)
    internal
    returns (bool success)
    {
        assembly {
            success := call(gas, to, value, add(data, 0x20), mload(data), 0, 0)
        }
    }

    function verifyReceipt(
        address scAddr,
        bytes32 taskId,
        bytes32 inStateDeltaHash,
        bytes32 outStateDeltaHash,
        bytes ethCall,
        bytes sig
    )
    internal
    {
        uint index = stateDeltaHashes[scAddr].length;
        if (index == 0) {
            require(inStateDeltaHash == 0x0, 'Invalid input state delta hash for empty state');
        } else {
            require(inStateDeltaHash == stateDeltaHashes[scAddr][index.sub(1)], 'Invalid input state delta hash');
        }
        stateDeltaHashes[scAddr].length++;
        stateDeltaHashes[scAddr][index] = outStateDeltaHash;

        // TODO: execute the Ethereum calls

        // Build a hash to validate that the I/Os are matching
        bytes32 hash = keccak256(abi.encodePacked(taskId, inStateDeltaHash, outStateDeltaHash, ethCall));

        // The worker address is not a real Ethereum wallet address but
        // one generated from its signing key
        address workerAddr = hash.recover(sig);
        require(workerAddr == workers[msg.sender].signer, "Invalid signature.");
    }

    /**
    * Commit the computation task results on chain
    */
    function commitReceipt(
        address scAddr,
        bytes32 taskId,
        bytes32 inStateDeltaHash,
        bytes32 outStateDeltaHash,
        bytes ethCall,
        bytes sig
    )
    public
    workerRegistered(msg.sender)
    {
        require(tasks[taskId].status == TaskStatus.RecordCreated, 'Invalid task status');
        verifyReceipt(scAddr, taskId, inStateDeltaHash, outStateDeltaHash, ethCall, sig);

        tasks[taskId].proof = sig;
        tasks[taskId].status = TaskStatus.ReceiptVerified;
        emit ReceiptVerified(taskId, inStateDeltaHash, outStateDeltaHash, ethCall, sig);
    }

    function commitReceipts(
        address scAddr,
        bytes32[] taskIds,
        bytes32[] inStateDeltaHashes,
        bytes32[] outStateDeltaHashes,
        bytes[] ethCalls,
        bytes[] sigs
    )
    public
    workerRegistered(msg.sender)
    {
        for (uint i = 0; i < taskIds.length; i++) {
            // TODO: consider aggregate signature
            require(tasks[taskIds[i]].status == TaskStatus.RecordCreated, 'Invalid task status');
            verifyReceipt(scAddr, taskIds[i], inStateDeltaHashes[i], outStateDeltaHashes[i], ethCalls[i], sigs[i]);

            tasks[taskIds[i]].proof = sigs[i];
            tasks[taskIds[i]].status = TaskStatus.ReceiptVerified;
        }
        emit ReceiptsVerified(taskIds, inStateDeltaHashes, outStateDeltaHashes, ethCalls, sigs);
    }

    // Verify the signature submitted while reparameterizing workers
    function verifyParamsSig(uint256 seed, bytes sig)
    internal
    pure
    returns (address)
    {
        bytes32 hash = keccak256(abi.encodePacked(seed));
        address signer = hash.recover(sig);
        return signer;
    }

    /**
    * Reparameterizing workers with a new seed
    * This should be called for each epoch by the Principal node
    *
    * @param seed The random integer generated by the enclave
    * @param sig The random integer signed by the the principal node's enclave
    */
    function setWorkersParams(uint seed, bytes sig)
    public
    workerRegistered(msg.sender)
    {
        address[] memory activeWorkers;
        address[] memory activeContracts;
        emit WorkersParameterized(seed, activeWorkers, activeContracts);
    }

    function getSelectedWorkers(uint blockNumber, address scAddr)
    public
    {
        uint tokenCpt = 0;
        for (uint i = 0; i < workerAddresses.length; i++) {
            tokenCpt= tokenCpt.add(workers[workerAddresses[i]].balance);
        }
        address[] memory tokens = new address[](tokenCpt);
        uint tokenIndex = 0;
        for (uint ia = 0; ia < workerAddresses.length; ia++) {
            for (uint ib = 0; ib < workers[workerAddresses[ia]].balance; ib++) {
                tokens[tokenIndex] = workerAddresses[ia];
                tokenIndex++;
            }
        }
    }

    /**
    * The worker parameters corresponding to the specified block number
    *
    * @param blockNumber The reference block number
    */
    function getWorkersParams(uint blockNumber)
    public
    view
    returns (uint, uint, address[], address[])
    {
        uint firstBlockNumber = 0;
        uint seed = 0;
        address[] memory activeWorkers;
        address[] memory activeContracts;
        return (firstBlockNumber, seed, activeWorkers, activeContracts);
    }

    /**
    * The RLP encoded report returned by the IAS server
    *
    * @param custodian The worker's custodian address
    */
    function getReport(address custodian)
    public
    view
    workerRegistered(custodian)
    returns (address, bytes)
    {
        // The RLP encoded report and signer's address for the specified worker
        require(workers[custodian].signer != 0x0, "Worker not registered");
        return (workers[custodian].signer, workers[custodian].report);
    }
}
