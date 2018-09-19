pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";

contract IERC20 {
    function balanceOf(address who) public view returns (uint256);
    function transfer(address to, uint256 value) public returns (bool);
    function allowance(address owner, address spender) public view returns (uint256);
    function transferFrom(address from, address to, uint256 value) public returns (bool);
    function approve(address spender, uint256 value) public returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}


contract Enigma {
    using SafeMath for uint256;
    using ECRecovery for bytes32;

    // The interface of the deployed ENG ERC20 token contract
    IERC20 public engToken;

    struct TaskRecord {
        bytes32 taskId;
        uint fee;
        address token;
        uint tokenValue;
    }

    struct TaskReceipt {
        bytes32 taskId;
        bytes32 inStateDeltaHash;
        bytes32 outStateDeltaHash;
        bytes ethCall;
        bytes sig;
    }

    struct Task {
        bytes32 taskId;
        uint fee;
        address token;
        uint tokenValue;
        bytes32 inStateDeltaHash;
        bytes32 outStateDeltaHash;
        bytes ethCall;
        bytes sig;
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
        address[] workerAddresses;
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

    // The events emitted by the contract
    event Registered(address custodian, address signer);
    event ValidatedSig(bytes sig, bytes32 hash, address workerAddr);
    event WorkersParameterized(uint256 seed, address[] workers, address[] secretContracts);
    event TaskRecordCreated(bytes32 taskId, uint fee, address token, uint tokenValue, address sender);
    event ReceiptVerified(bytes32 taskId, bytes32 inStateDeltaHash, bytes32 outStateDeltaHash, bytes ethCall, bytes sig);

    constructor(address _tokenAddress, address _principal) public {
        engToken = IERC20(_tokenAddress);
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
        emit TaskRecordCreated(taskId, fee, token, tokenValue, msg.sender);
    }

    // Verify the task results signature
    function verifyCommitSig(Task task, bytes sig)
        internal
        returns (address)
    {
        //TODO: implement

        bytes32 hash = 0x0;
        address workerAddr = 0x0;
        emit ValidatedSig(sig, hash, workerAddr);
        return 0x0;
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

    /**
    * Commit the computation task results on chain
    */
    function commitReceipt(bytes32 taskId, bytes32 inStateDeltaHash, bytes32 outStateDeltaHash, bytes ethCall, bytes sig)
        public
        workerRegistered(msg.sender)
    {
        //TODO: implement
        emit ReceiptVerified(taskId, inStateDeltaHash, outStateDeltaHash, ethCall, sig);
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
        address[] memory workers;
        address[] memory secretContracts;
        emit WorkersParameterized(seed, workers, secretContracts);
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
        address[] memory workers;
        address[] memory secretContracts;
        return (firstBlockNumber, seed, workers, secretContracts);
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
