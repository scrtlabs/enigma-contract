/**
 * Encapsulates the Task
 */
export default class Task {
  /**
   * Task wrapper for contract deployment and regular tasks. This object is iteratively built up during the task
   * lifecycle - base task (local) -> task record (to be saved on ETH) -> task input (to be sent to the ENG network)
   * -> task result (result and status obtained form ENG network)
   *
   * @param {string} taskIdInputHash
   * @param {string} fn
   * @param {string} abiEncodedArgs
   * @param {string} fee
   * @param {string} sender
   * @param {string} scAddr
   */
  constructor(taskIdInputHash, fn, abiEncodedArgs, fee, sender, scAddr) {
    // Base task attributes for task initialized locally
    this.taskIdInputHash = taskIdInputHash;
    this.fn = fn;
    this.abiEncodedArgs = abiEncodedArgs;
    this.fee = fee;
    this.sender = sender;
    this.scAddr = scAddr;

    // Attributes added to task when task record is created on ETH, most critically, the taskId (a unique value
    // for each task computed from hash(hash(function signature, ABI-encoded arguments, user's public key), user's
    // nonce value monotonically increasing for every task deployment)
    this.transactionHash = '';
    this.taskId = '';
    this.receipt = '';
    this.ethStatus = 0;
    this.proof = '';
    this.creationBlockNumber = -1;

    // Attributes added to task during preparation of task input to be sent to the ENG network for computation
    this.msgId = '';
    this.encryptedFn = '';
    this.encryptedAbiEncodedArgs = '';
    this.encryptedUserPubKey = '';
    this.userTaskSig = '';

    // Attributes added to task when computation result is being polled from the ENG network
    this.encryptedAbiEncodedOutputs = '';
    this.workerTaskSig = '';
    this.engStatus = '';
  }
}
