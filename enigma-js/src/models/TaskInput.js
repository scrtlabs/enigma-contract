/**
 * Encapsulates the task input
 */
export default class TaskInput {
  /**
   * Task input constructor
   *
   * @param {string} taskId
   * @param {number} creationBlockNumber
   * @param {string} sender
   * @param {string} scAddr
   * @param {string} fnSig
   * @param {string} encodedInputs
   * @param {string} sig
   * @param {string} userPubKey
   */
  constructor(taskId, creationBlockNumber, sender, scAddr, fnSig, encodedInputs, sig, userPubKey) {
    this.taskId = taskId;
    this.creationBlockNumber = creationBlockNumber;
    this.sender = sender;
    this.scAddr = scAddr;
    this.fnSig = fnSig;
    this.encodedInputs = encodedInputs;
    this.sig = sig;
    this.userPubKey = userPubKey;
  }

  /**
   * Task input serializer for p2p network
   *
   * @param {string} userPubKey
   * @return {Array}
   */
  serialize() {
    return [this.taskId, this.creationBlockNumber, this.sender, this.scAddr, this.fnSig, this.encodedInputs,
      this.sig, this.userPubKey];
  }
}
