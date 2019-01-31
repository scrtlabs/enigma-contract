pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

import { EnigmaCommon } from "./EnigmaCommon.sol";
import { EnigmaState } from "./EnigmaState.sol";

/**
 * @author Enigma
 *
 * Library that maintains functionality associated with Principal node
 */
library PrincipalImpl {
    using SafeMath for uint256;

    event WorkersParameterized(uint seed, uint256 blockNumber, address[] workers, uint[] balances, uint nonce);

    function setWorkersParamsImpl(EnigmaState.State storage state, uint _seed, bytes memory _sig)
    public
    {
        // Reparameterizing workers with a new seed
        // This should be called for each epoch by the Principal node

        // We assume that the Principal is always the first registered node
        require(state.workers[msg.sender].signer == state.principal, "Only the Principal can update the seed");
        // TODO: verify the principal sig

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
        workerParams.nonce = state.userTaskDeployments[msg.sender];

        // Copy the current worker list
        uint workerIndex = 0;
        for (uint wi = 0; wi < state.workerAddresses.length; wi++) {
            EnigmaCommon.Worker memory worker = state.workers[state.workerAddresses[wi]];
            if ((worker.balance >= state.stakingThreshold) && (worker.signer != state.principal) &&
                (worker.status == EnigmaCommon.WorkerStatus.LoggedIn)) {
                workerParams.workers.length++;
                workerParams.workers[workerIndex] = state.workerAddresses[wi];

                workerParams.balances.length++;
                workerParams.balances[workerIndex] = worker.balance;

                workerIndex = workerIndex.add(1);
            }
        }
        emit WorkersParameterized(_seed, block.number, workerParams.workers,
            workerParams.balances, state.userTaskDeployments[msg.sender]);
        state.userTaskDeployments[msg.sender]++;
    }
}
