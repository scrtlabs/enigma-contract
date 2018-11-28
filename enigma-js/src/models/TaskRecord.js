/**
 * Encapsulates the task record
 */
export default class TaskRecord {
  /**
   * Task record constructor
   *
   * @param {string} taskId
   * @param {string} fee
   */
  constructor(taskId, fee) {
    this.taskId = taskId;
    this.fee = parseInt(fee);
    this.transactionHash = '';
    this.receipt = {};
    this.status = 0;
    this.proof = '';
  }
}
