pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

contract EnigmaEvents {
    event Registered(address custodian, address signer);
    event ValidatedSig(bytes sig, bytes32 hash, address workerAddr);
    event WorkersParameterized(uint seed, uint256 blockNumber, address[] workers, uint[] balances, uint nonce);
    event TaskRecordCreated(bytes32 taskId, uint gasLimit, uint gasPx, address sender);
    event TaskRecordsCreated(bytes32[] taskIds, uint[] gasLimits, uint[] gasPxs, address sender);
    event ReceiptVerified(bytes32 taskId, bytes32 stateDeltaHash, bytes32 outputHash, bytes ethCall, bytes sig);
    event ReceiptsVerified(bytes32[] taskIds, bytes32[] _stateDeltaHashes, bytes32 outputHash, bytes ethCall, bytes sig);
    event ReceiptFailed(bytes32 taskId, bytes ethCall, bytes sig);
    event TaskFeeReturned(bytes32 taskId);
    event DepositSuccessful(address from, uint value);
    event WithdrawSuccessful(address to, uint value);
    event SecretContractDeployed(bytes32 scAddr, bytes32 codeHash);
}
