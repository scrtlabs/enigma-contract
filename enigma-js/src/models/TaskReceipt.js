/**
 * Encapsulates the task receipt
 */
export default class TaskReceipt {
  /**
   * Task record constructor
   *
   * @param {string} taskId
   * @param {string} inStateDeltaHash
   * @param {string} outStateDeltaHash
   * @param {string} ethCall
   * @param {string} sig
   */
  constructor(taskId, inStateDeltaHash, outStateDeltaHash, ethCall, sig) {
    this.taskId = taskId;
    this.inStateDeltaHash = inStateDeltaHash;
    this.outStateDeltaHash = outStateDeltaHash;
    this.ethCall = ethCall;
    this.sig = sig;
  }
}
