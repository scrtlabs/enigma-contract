/**
 * Encapsulates the task record
 */
export default class TaskRecord {
  /**
   * Task record constructor
   *
   * @param {string} fee
   */
  constructor(fee) {
    this.taskId = '';
    this.fee = parseInt(fee);
    this.transactionHash = '';
    this.receipt = {};
    this.status = 0;
    this.proof = '';
    this.creationBlockNumber = -1;
  }
}
