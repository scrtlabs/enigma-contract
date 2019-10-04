pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

import { EnigmaCommon } from "./EnigmaCommon.sol";
import { EnigmaState } from "./EnigmaState.sol";
import { TaskImpl } from "./TaskImpl.sol";
import { Bytes } from "../utils/Bytes.sol";

/**
 * @author Enigma
 *
 * Library that maintains functionality associated with tasks
 */
library UpgradeImpl {
    using SafeMath for uint256;
    using ECDSA for bytes32;
    using Bytes for address;

    function upgradeEnigmaContractImpl(
        EnigmaState.State storage state,
        address _updatedEnigmaContractAddress
    )
    public
    {
        state.updatedEnigmaContractAddress = _updatedEnigmaContractAddress;

        for (uint i = 0; i < state.taskIds.length; i++) {
            if (state.tasks[state.taskIds[i]].status == EnigmaCommon.TaskStatus.RecordCreated) {
                EnigmaCommon.TaskRecord storage task = state.tasks[state.taskIds[i]];

                // Return the full fee to the task sender
                require(state.engToken.transfer(task.sender, task.gasLimit.mul(task.gasPx)), "Token transfer failed");

                // Set task's status to ReceiptFailed and emit event
                task.status = EnigmaCommon.TaskStatus.ReceiptFailedReturn;
            }
        }
    }

    function transferWorkerStakePostUpgradeImpl(
        EnigmaState.State storage state,
        address _workerAddress,
        address _signer,
        bytes memory _sig
    )
    public
    returns (uint256)
    {
        // Verify the worker's signature
        bytes memory message;
        message = EnigmaCommon.appendMessage(message, state.updatedEnigmaContractAddress.toBytes());
        bytes32 msgHash = keccak256(message);
        require(msgHash.recover(_sig) == _signer, "Invalid signature");
        EnigmaCommon.Worker storage worker = state.workers[_workerAddress];
        require(state.engToken.transfer(state.updatedEnigmaContractAddress, worker.balance),
            "Token transfer failed");
        uint256 oldWorkerBalance = worker.balance;
        worker.balance = 0;
        return oldWorkerBalance;
    }
}
