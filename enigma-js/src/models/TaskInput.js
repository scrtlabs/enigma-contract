import web3Utils from "web3-utils";
import utils from '../enigma-utils'

/**
 * Encapsulates the task input
 */
export default class TaskInput {
  /**
   * Task input constructor
   *
   * @param {number} creationBlockNumber
   * @param {string} sender
   * @param {string} scAddr
   * @param {string} fn
   * @param {Array} args
   * @param {string} userPubKey
   * @param {Number} fee
   */
  constructor(creationBlockNumber, sender, scAddr, fn, args, userPubKey, fee) {
    this.taskId = utils.generateTaskId(fn, args, scAddr, creationBlockNumber, userPubKey);
    this.creationBlockNumber = creationBlockNumber;
    this.sender = sender;
    this.scAddr = scAddr;
    this.encryptedFn = '';
    this.encryptedEncodedArgs = '';
    this.sig = '';
    this.userPubKey = userPubKey;
    this.fee = fee;
  }
  //
  // /**
  //  * Task input serializer for p2p network
  //  *
  //  * @param {string} userPubKey
  //  * @return {Array}
  //  */
  // serialize() {
  //   return [this.taskId, this.creationBlockNumber, this.sender, this.scAddr, [encrypted(this.fnSig), encrypted(this.encodedInputs)],
  //     this.sig, this.userPubKey];
  // }
}
