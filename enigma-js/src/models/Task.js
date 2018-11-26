/**
 * Encapsulates the task receipt
 */
export default class Task {
  /**
   * Task record constructor
   *
   * @param {string} taskId
   * @param {string} fee
   * @param {string} token
   * @param {string} tokenValue
   * @param {string} inStateDeltaHash
   * @param {string} outStateDeltaHash
   * @param {string} ethCall
   * @param {string} sig
   * @param {string} sender
   * @param {string} status
   */
  constructor(taskId, fee, token, tokenValue, inStateDeltaHash, outStateDeltaHash, ethCall, sig, sender, status) {
    this.taskId = taskId;
    this.fee = parseInt(fee);
    this.token = token;
    this.tokenValue = parseInt(tokenValue);
    this.inStateDeltaHash = inStateDeltaHash;
    this.outStateDeltaHash = outStateDeltaHash;
    this.ethCall = ethCall;
    this.sig = sig;
    this.sender = sender;
    this.status = parseInt(status);
  }
}
