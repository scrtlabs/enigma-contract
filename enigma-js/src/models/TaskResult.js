/**
 * Encapsulates the task receipt
 */
export default class TaskResult {
  /**
   * Task record constructor
   *
   * @param {string} taskId
   * @param {Array} encryptedInputs
   * @param {string} sig
   * @param {Number} status
   */
  constructor(taskId, encryptedInputs, sig, status) {
    this.taskId = taskId;
    this.encryptedInputs = encryptedInputs;
    this.sig = sig;
    this.status = parseInt(status);
  }
}
