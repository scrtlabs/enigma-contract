/**
 * Encapsulates the task receipt
 */
export default class TaskResult {
  /**
   * Task record constructor
   *
   * @param {string} taskId
   * @param {string} encryptedEncodedOutputs
   * @param {string} sig
   * @param {Number} status
   */
  constructor(taskId, encryptedEncodedOutputs, sig, status) {
    this.taskId = taskId;
    this.encryptedEncodedOutputs = encryptedEncodedOutputs;
    this.sig = sig;
    this.status = parseInt(status);
  }
}
