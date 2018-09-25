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

/**
 * Encapsulates the task receipt
 */
export class Task {
  /**
   * Instantiate a task
   *
   */
  constructor(taskId, fee, token, tokenValue, inStateDeltaHash, outStateDeltaHash, ethCall, sig, sender, status) {
    this.taskId = taskId;
    this.fee = fee;
    this.token = token;
    this.tokenValue = tokenValue;
    this.inStateDeltaHash = inStateDeltaHash;
    this.outStateDeltaHash = outStateDeltaHash;
    this.ethCall = ethCall;
    this.sig = sig;
    this.sender = sender;
    this.status = status;
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
    let emitter = new EventEmitter();
    this.enigmaContract.methods.createTaskRecord(taskId, fee, token, tokenValue).
      send(this.txDefaults).
      on('transactionHash', (hash) => {
        console.log('got tx hash', hash);
        emitter.emit('transactionHash', hash);
      }).
      on('receipt', (receipt) => {
        console.log('got task record receipt', receipt);
        const event = receipt.events.TaskRecordCreated;
        const taskRecord = new TaskRecord(
          event.returnValues.taskId,
          event.returnValues.fee,
          event.returnValues.token,
          event.returnValues.tokenValue,
          event.transactionHash,
          receipt,
        );
        emitter.emit('mined', taskRecord);
      }).
      on('confirmation', (confirmationNumber, receipt) => {
        console.log('got confirmation', confirmationNumber, receipt);
        const event = receipt.events.TaskRecordCreated;
        const taskRecord = new TaskRecord(
          event.returnValues.taskId,
          event.returnValues.fee,
          event.returnValues.token,
          event.returnValues.tokenValue,
          event.transactionHash,
          receipt,
        );
        emitter.emit('confirmed', taskRecord);
      }).
      on('error', console.error);
    return emitter;
  }

  /**
   * Store multiple task records
   */
  createTaskRecords(taskRecords) {
    let taskIds = [];
    let fees = [];
    let tokens = [];
    let tokenValues = [];
    taskRecords.forEach((taskRecord) => {
      taskIds.push(taskRecord.taskId);
      fees.push(taskRecord.fee);
      tokens.push(taskRecord.token || '0x0');
      tokenValues.push(taskRecord.tokenValue || 0);
    });
    let emitter = new EventEmitter();
    console.log('creating task records', taskIds, fees, tokens, tokenValues);
    this.enigmaContract.methods.createTaskRecords(taskIds, fees, tokens, tokenValues).
      send(this.txDefaults).
      on('transactionHash', (hash) => {
        console.log('got tx hash', hash);
        emitter.emit('transactionHash', hash);
      }).
      on('receipt', (receipt) => {
        console.log('got task record receipt', receipt.events);
        const event = receipt.events.TaskRecordsCreated;
        let taskRecords = [];
        for (let i = 0; i < event.returnValues.taskIds.length; i++) {
          const taskRecord = new TaskRecord(
            event.returnValues.taskIds[i],
            event.returnValues.fees[i],
            event.returnValues.tokens[i],
            event.returnValues.tokenValues[i],
            event.transactionHash,
            receipt,
          );
          taskRecords.push(taskRecord);
        }
        emitter.emit('mined', taskRecords);
      }).
      on('confirmation', (confirmationNumber, receipt) => {
        console.log('got confirmation', confirmationNumber, receipt);
        const event = receipt.events.TaskRecordsCreated;
        let taskRecords = [];
        for (let i = 0; i < event.returnValues.taskIds.length; i++) {
          const taskRecord = new TaskRecord(
            event.returnValues.taskIds[i],
            event.returnValues.fees[i],
            event.returnValues.tokens[i],
            event.returnValues.tokenValues[i],
            event.transactionHash,
            receipt,
          );
          taskRecords.push(taskRecord);
        }
        emitter.emit('confirmed', taskRecords);
      }).
      on('error', console.error);
    return emitter;
  }

  /**
   * Find an existing task
   *
   * @param {string} taskId
   */
  getTask(taskId) {
    return this.enigmaContract.methods.tasks(taskId).call().then((result) => {
      console.log('the task', result);
      return new Task(
        taskId,
        parseInt(result.fee),
        result.token,
        parseInt(result.tokenValue),
        result.inStateDeltaHash,
        result.outStateDeltaHash,
        result.ethCall,
        result.sig,
        result.sender,
        parseInt(result.status),
      );
    });
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
