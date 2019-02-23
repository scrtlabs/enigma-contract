pragma solidity ^0.5.0;

interface IEnigma {
    function register(address _signer, bytes calldata _report, bytes calldata _signature) external;
    function getActiveWorkers(uint _blockNumber) external view returns (address[] memory, uint[] memory);
    function setWorkersParams(uint _blockNumber, uint _seed, bytes calldata _sig) external;
}
