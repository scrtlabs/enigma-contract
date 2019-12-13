pragma solidity ^0.5.12;
pragma experimental ABIEncoderV2;

interface IEnigma {
    function register(address _stakingAddress, address _signer, bytes calldata _report, bytes calldata _signature) external;
    function getActiveWorkers(uint _blockNumber) external view returns (address[] memory, uint[] memory);
    function setWorkersParams(uint _blockNumber, uint _seed, bytes calldata _sig) external;
    function countSecretContracts() external view returns (uint);
    function getSecretContractAddresses(uint _start, uint _stop) external view returns (bytes32[] memory);
    function getAllSecretContractAddresses() external view returns (bytes32[] memory);
    function getSigningAddress() external view returns (address);
    function transferWorkerStakePostUpgrade(address _operatingAddress, address _stakingAddress, bytes calldata _sig)
        external returns (uint);
}
