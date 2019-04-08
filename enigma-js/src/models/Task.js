import utils from '../enigma-utils';

/**
 * Encapsulates the Task
 */
export default class Task {
  /**
   * Task wrapper for contract deployment and regular tasks. This object is iteratively built up during the task
   * lifecycle
   *
   * @param {string} scAddr
   * @param {string} encryptedFn
   * @param {string} encryptedAbiEncodedArgs
   * @param {Number} gasLimit
   * @param {Number} gasPx
   * @param {string} msgId
   * @param {string} userPubKey
   * @param {Number} firstBlockNumber
   * @param {string} workerAddress
   * @param {string} workerEncryptionKey
   * @param {string} sender
   * @param {string} userTaskSig
   * @param {Number} nonce
   * @param {string} preCode
   * @param {string} preCodeHash
   * @param {boolean} isContractDeploymentTask
   */
  constructor(scAddr, encryptedFn, encryptedAbiEncodedArgs, gasLimit, gasPx, msgId, userPubKey, firstBlockNumber,
              workerAddress, workerEncryptionKey, sender, userTaskSig, nonce, preCode, preCodeHash,
              isContractDeploymentTask) {
    // Initial task attributes
    this.inputsHash = utils.hash([encryptedFn, encryptedAbiEncodedArgs,
      isContractDeploymentTask ? preCodeHash : scAddr, userPubKey]);
    this.scAddr = scAddr;
    this.encryptedFn = encryptedFn;
    this.encryptedAbiEncodedArgs = encryptedAbiEncodedArgs;
    this.gasLimit = gasLimit;
    this.gasPx = gasPx;
    this.msgId = msgId;
    this.userPubKey = userPubKey;
    this.firstBlockNumber = firstBlockNumber;
    this.workerAddress = workerAddress;
    this.workerEncryptionKey = workerEncryptionKey;
    this.sender = sender;
    this.userTaskSig = userTaskSig;
    this.nonce = nonce;
    this.preCode = preCode;
    this.preCodeHash = preCodeHash;
    this.isContractDeploymentTask = isContractDeploymentTask;

    // Attributes added to task when task record is created on ETH, most critically, the taskId (a unique value
    // for each task computed from hash(hash(encrypted function signature, encrypted ABI-encoded arguments, gas limit,
    // gas price, user's ETH address), user's nonce value monotonically increasing for every task deployment)
    this.transactionHash = '';
    this.taskId = '';
    this.receipt = '';
    this.ethStatus = 0;
    this.proof = '';
    this.creationBlockNumber = -1;

    // Attributes added to task when computation result is being polled/retrieved from the ENG network
    this.encryptedAbiEncodedOutputs = '';
    this.delta = '';
    this.usedGas = '';
    this.ethereumPayload = '';
    this.ethereumAddress = '';
    this.workerTaskSig = '';
    this.engStatus = 'null';

    this.decryptedOutput = '';
  }
}
