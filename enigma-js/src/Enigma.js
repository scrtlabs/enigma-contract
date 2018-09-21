/* eslint-disable prefer-spread,prefer-rest-params,valid-jsdoc */
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import EventEmitter from 'eventemitter3';

/**
 * Encapsulates a task record
 */
export class TaskRecord {
  /**
   * Instantiate a task record
   *
   * @param {string} taskId
   * @param {number} fee
   * @param {Object} token
   * @param {number} tokenValue
   */
  constructor(taskId, fee, token, tokenValue, transactionHash, receipt) {
    this.taskId = taskId;
    this.fee = fee;
    this.token = token;
    this.tokenValue = tokenValue;
    this.transactionHash = transactionHash;
    this.receipt = receipt;
  }
}

/**
 * Encapsulates the task receipt
 */
export class TaskReceipt {
  /**
   * Instantiate a task receipt
   *
   * @param {Object} scAddr
   * @param {string} inputStateDeltaHash
   * @param {string} outputStateDeltaHash
   * @param {string} inputsHash
   * @param {string} resultsHash
   * @param {string} userPubKeyHash
   * @param {string} ethCallsHash
   * @param {number} blockNumber
   */
  constructor(
    scAddr, inputStateDeltaHash, outputStateDeltaHash, inputsHash, resultsHash, userPubKeyHash, ethCallsHash,
    blockNumber) {

  }
}

/**
 * Class encapsulation the Enigma operations.
 */
export default class Enigma {
  /**
   * The Enigma constructor
   *
   * @param {Web3} web3
   * @param {string} enigmaContractAddr
   * @param {string} tokenContractAddr
   * @param {Object} txDefaults
   */
  constructor(web3, enigmaContractAddr, tokenContractAddr, txDefaults = {}) {
    this.web3 = web3;
    this.txDefaults = txDefaults;

    this.createContracts(enigmaContractAddr, tokenContractAddr);
  }

  /**
   * Creating the Enigma contracts.
   *
   * @param {string} enigmaContractAddr
   * @param {string} tokenContractAddr
   */
  createContracts(enigmaContractAddr, tokenContractAddr) {
    this.enigmaContract = new this.web3.eth.Contract(EnigmaContract['abi'],
      enigmaContractAddr, this.txDefaults);
    this.tokenContract = new this.web3.eth.Contract(EnigmaTokenContract['abi'],
      tokenContractAddr, this.txDefaults);
  }

  /**
   * Store a task record on chain
   *
   * @param {string} taskId
   * @param {number} fee
   * @param {string} token
   * @param {number} tokenValue
   */
  createTaskRecord(taskId, fee, token = '0x0', tokenValue = 0) {
    console.log('creating task record', taskId, fee);

    /**
     * Create a TaskRecord object
     *
     * @param sender
     * @param transactionHash
     * @param status
     * @return {TaskRecord}
     */
    function getTaskRecord(transactionHash, receipt) {
      return new TaskRecord(
        taskId,
        fee,
        token,
        tokenValue,
        transactionHash,
        receipt,
      );
    }

    let emitter = new EventEmitter();
    this.enigmaContract.methods.createTaskRecord(taskId, fee, token, tokenValue).
      send(this.txDefaults).
      on('transactionHash', (hash) => {
        console.log('got tx hash', hash);
        const taskRecord = getTaskRecord(hash, null);
        emitter.emit('transactionHash', taskRecord);
      }).
      on('receipt', (receipt) => {
        console.log('got task record receipt', receipt);
        const event = receipt.events.TaskRecordCreated;
        const taskRecord = getTaskRecord(event.transactionHash, receipt);
        emitter.emit('mined', taskRecord);
      }).
      on('confirmation', (confirmationNumber, receipt) => {
        console.log('got confirmation', confirmationNumber, receipt);
        const event = receipt.events.TaskRecordCreated;
        const taskRecord = getTaskRecord(event.transactionHash, receipt);
        emitter.emit('confirmed', taskRecord);
      }).
      on('error', console.error);
    return emitter;
  }

  /**
   * Store multiple task records
   */
  createTaskRecords() {
    throw new Error('not implemented');
  }

  /**
   * Find an existing task
   *
   * @param {string} taskId
   */
  getTask(taskId) {

  }

  /**
   * Store a task receipt
   */
  commitTaskReceipt() {

  }

  /**
   * Store multiple task receipts
   */
  commitTaskReceipts() {

  }

  /**
   * Find SGX report
   * @param {string} signerAddr
   */
  getReport(signerAddr) {

  }

  /**
   * Return the version number of the library
   *
   * @return {string}
   */
  version() {
    return '0.0.1';
  }
}
