/**
 * Encapsulates the task record
 */
export default class TaskRecord {
  /**
   * Task record constructor
   *
   * @param {string} taskId
   * @param {string} fee
   * @param {string} token
   * @param {string} tokenValue
   * @param {string} transactionHash
   * @param {string} receipt
   */
  constructor(taskId, fee, token, tokenValue, transactionHash, receipt) {
    this.taskId = taskId;
    this.fee = parseInt(fee);
    this.token = token;
    this.tokenValue = parseInt(tokenValue);
    this.transactionHash = transactionHash;
    this.receipt = receipt;
  }
}
