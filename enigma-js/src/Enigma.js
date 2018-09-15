/* eslint-disable prefer-spread,prefer-rest-params */
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';

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
  constructor(taskId, fee, token, tokenValue) {
    this.taskId = taskId;
    this.fee = fee;
    this.token = token;
    this.tokenValue = tokenValue;
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
export class Enigma {
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
   */
  createTaskRecord(taskId, fee) {
    console.log('creating task record', taskId, fee);
    this.enigmaContract.methods.createTaskRecord(taskId, fee).
      send(this.txDefaults).
      on('transactionHash', function(hash) {
        console.log('got tx hash', hash);
      }).
      on('receipt', function(receipt) {
        console.log('got receipt', receipt);
      }).
      on('confirmation', function(confirmationNumber, receipt) {
        console.log('got confirmation', confirmationNumber, receipt);
      }).
      on('error', console.error);
  }

  /**
   * Store multiple task records
   */
  createTaskRecords() {

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
