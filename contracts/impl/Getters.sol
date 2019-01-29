pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "./EnigmaStorage.sol";
import { EnigmaCommon } from "./EnigmaCommon.sol";

contract Getters is EnigmaStorage {
    function getWorker(address _worker) public view returns (EnigmaCommon.Worker memory) {
        return state.workers[_worker];
    }

    function getUserTaskDeployments(address _sender) public view returns (uint) {
        return state.userTaskDeployments[_sender];
    }

    function getEpochSize() public view returns (uint) {
        return state.epochSize;
    }

    function getTaskRecord(bytes32 _taskId) public view returns (EnigmaCommon.TaskRecord memory) {
        return state.tasks[_taskId];
    }

    function getSecretContract(bytes32 _scAddr) public view returns (EnigmaCommon.SecretContract memory) {
        return state.contracts[_scAddr];
    }
}
