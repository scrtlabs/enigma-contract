/**
 * Encapsulates the Task
 */
export default class Task {
  /**
   * Task record constructor
   *
   * @param {string} taskIdInputHash
   * @param {string} fn
   * @param {string} args
   * @param {string} fee
   * @param {string} userPubKey
   * @param {string} sender
   */
  constructor(taskIdInputHash, fn, args, fee, userPubKey, sender) {
    this.taskIdInputHash = taskIdInputHash;
    this.taskId = '';
    this.fn = fn;
    this.args = args;
    this.userPubKey = userPubKey;
    this.fee = fee;
    this.sender = sender;
    this.transactionHash = '';
    this.receipt = '';
    this.ethStatus = 0;
    this.creationBlockNumber = -1;
  }
}
