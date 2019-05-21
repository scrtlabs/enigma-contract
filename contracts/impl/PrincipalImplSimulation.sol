pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

import { EnigmaCommon } from "./EnigmaCommon.sol";
import { EnigmaState } from "./EnigmaState.sol";
import { WorkersImplSimulation } from "./WorkersImplSimulation.sol";
import { Bytes } from "../utils/Bytes.sol";

/**
 * @author Enigma
 *
 * Library that maintains functionality associated with Principal node
 */
library PrincipalImplSimulation {
    using SafeMath for uint256;
    using ECDSA for bytes32;
    using Bytes for bytes;
    using Bytes for bytes32;
    using Bytes for uint256;
    using Bytes for address;

    event WorkersParameterized(uint seed, uint256 firstBlockNumber, uint256 inclusionBlockNumber, address[] workers,
        uint[] stakes, uint nonce);

    function setWorkersParamsImpl(EnigmaState.State storage state, uint _blockNumber, uint _seed, bytes memory _sig)
    public
    {
        // Reparameterizing workers with a new seed
        // This should be called for each epoch by the Principal node

        // We assume that the Principal is always the first registered node
        require(state.workers[msg.sender].signer == state.principal, "Only the Principal can update the seed");
        require(_blockNumber - WorkersImplSimulation.getFirstBlockNumberImpl(state, _blockNumber) >= state.epochSize,
            "Already called during this epoch");

        // Create a new workers parameters item for the specified seed.
        // The workers parameters list is a sort of cache, it never grows beyond its limit.
        // If the list is full, the new item will replace the item assigned to the lowest block number.
        uint paramIndex = 0;
        for (uint pi = 0; pi < state.workersParams.length; pi++) {
            // Find an empty slot in the array, if full use the lowest block number
            if (state.workersParams[pi].firstBlockNumber == 0) {
                paramIndex = pi;
                break;
            } else if (state.workersParams[pi].firstBlockNumber < state.workersParams[paramIndex].firstBlockNumber) {
                paramIndex = pi;
            }
        }
        EnigmaCommon.WorkersParams storage workerParams = state.workersParams[paramIndex];
        workerParams.firstBlockNumber = block.number;
        workerParams.seed = _seed;

        (workerParams.workers, workerParams.stakes) = getActiveWorkersImpl(state, _blockNumber);

        // Verify the principal's signature
        bytes memory message;
        message = EnigmaCommon.appendMessage(message, _seed.toBytes());
        message = EnigmaCommon.appendMessage(message, state.userTaskDeployments[msg.sender].toBytes());
        message = EnigmaCommon.appendMessageArrayLength(workerParams.workers.length, message);
        for (uint i = 0; i < workerParams.workers.length; i++) {
            message = EnigmaCommon.appendMessage(message, workerParams.workers[i].toBytes());
        }
        message = EnigmaCommon.appendMessageArrayLength(workerParams.stakes.length, message);
        for (uint j = 0; j < workerParams.stakes.length; j++) {
            message = EnigmaCommon.appendMessage(message, workerParams.stakes[j].toBytes());
        }
        bytes32 msgHash = keccak256(message);
        // require(msgHash.recover(_sig) == state.principal, "Invalid signature");

        for (uint wi = 0; wi < workerParams.workers.length; wi++) {
            EnigmaCommon.Worker storage worker = state.workers[workerParams.workers[wi]];
            worker.workerLogs.push(EnigmaCommon.WorkerLog({
                workerEventType: EnigmaCommon.WorkerLogType.Compound,
                blockNumber: block.number,
                balance: worker.balance
            }));
        }

        emit WorkersParameterized(_seed, block.number, _blockNumber, workerParams.workers,
            workerParams.stakes, state.userTaskDeployments[msg.sender]);
        state.userTaskDeployments[msg.sender]++;
    }

    function getActiveWorkersImpl(EnigmaState.State storage state, uint _blockNumber)
    public
    view
    returns (address[] memory, uint[] memory)
    {
        uint maxLength = state.workerAddresses.length;
        address[] memory activeWorkerAddressesFull = new address[](maxLength);
        uint[] memory activeWorkerStakesFull = new uint[](maxLength);
        uint filteredCount;

        for (uint i = 0; i < maxLength; i++) {
            EnigmaCommon.Worker memory worker = state.workers[state.workerAddresses[i]];
            EnigmaCommon.WorkerLog memory workerLog = WorkersImplSimulation.getLatestWorkerLogImpl(worker, _blockNumber);
            if (((workerLog.workerEventType == EnigmaCommon.WorkerLogType.LogIn) ||
                (workerLog.workerEventType == EnigmaCommon.WorkerLogType.Compound)) &&
                worker.signer != state.principal)
            {
                activeWorkerAddressesFull[filteredCount] = worker.signer;
                activeWorkerStakesFull[filteredCount] = workerLog.balance;
                filteredCount++;
            }
        }

        address[] memory activeWorkerAddresses = new address[](filteredCount);
        uint[] memory activeWorkerStakes = new uint[](filteredCount);
        for (uint ic = 0; ic < filteredCount; ic++) {
            activeWorkerAddresses[ic] = activeWorkerAddressesFull[ic];
            activeWorkerStakes[ic] = activeWorkerStakesFull[ic];
        }

        return (activeWorkerAddresses, activeWorkerStakes);
    }
}
