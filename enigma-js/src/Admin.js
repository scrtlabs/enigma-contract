import EventEmitter from 'eventemitter3';
import * as eeConstants from './emitterConstants';

/**
 * Encapsulates the admin operations
 */
export default class Admin {
  /**
   * Constructor
   * @param {Web3} web3
   * @param {Web3.Contract} enigmaContract
   * @param {Web3.Contract} tokenContract
   * @param {Object} txDefaults
   * @param {Object} enigma
   */
  constructor(web3, enigmaContract, tokenContract, txDefaults, enigma) {
    this.web3 = web3;
    this.enigmaContract = enigmaContract;
    this.tokenContract = tokenContract;
    this.txDefaults = txDefaults;
    this.enigma = enigma;
  }

  /**
   * Get worker status
   *
   * @param {string} account
   * @param {Object} options
   * @return {EventEmitter}
   */
  getWorkerStatus(account, options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    options.from = account;
    let emitter = new EventEmitter();
    (async () => {
      const worker = await this.enigmaContract.methods.workers(account).call();
      const workerStatus = parseInt(worker.status);
      emitter.emit(eeConstants.GET_WORKER_STATUS_RESULT, workerStatus);
    })();
    return emitter;
  }

  /**
   * Checks if a secret contract is deployed.
   *
   * @param {string} scAddr
   * @return {Promise}
   */
  isDeployed(scAddr) {
    return this.enigmaContract.methods.isDeployed(scAddr).call();
  }

  /**
   * Fetches the secret contract code hash.
   *
   * @param {string} scAddr
   * @return {Promise}
   */
  getCodeHash(scAddr) {
    return this.enigmaContract.methods.getCodeHash(scAddr).call();
  }

  /**
   * Count the state deltas for the specified secret contract.
   *
   * @param {string} scAddr
   * @return {Promise}
   */
  countStateDeltas(scAddr) {
    return this.enigmaContract.methods.countStateDeltas(scAddr).call().then((result) => {
      return parseInt(result);
    });
  }

  /**
   * Fetch the state delta hash at the specified index position.
   *
   * @param {string} scAddr
   * @param {number} index
   * @return {Promise}
   */
  getStateDeltaHash(scAddr, index) {
    return this.enigmaContract.methods.getStateDeltaHash(scAddr, index).call();
  }

  /**
   * Fetch state delta hash range
   *
   * @param {string} scAddr
   * @param {number} start
   * @param {number} stop
   * @return {Promise}
   */
  getStateDeltaHashes(scAddr, start, stop) {
    return this.enigmaContract.methods.getStateDeltaHashes(scAddr, start, stop).call();
  }

  /**
   * Check that the specified state delta hash is valid.
   *
   * @param {string} scAddr
   * @param {string} stateDeltaHash
   * @return {Promise}
   */
  isValidDeltaHash(scAddr, stateDeltaHash) {
    return this.enigmaContract.methods.isValidDeltaHash(scAddr, stateDeltaHash).call();
  }

  /**
   * Login workers.
   *
   * @param {Object} options
   * @return {Promise}
   */
  login(options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    let emitter = new EventEmitter();
    this.enigmaContract.methods.login().send(options)
      .on('transactionHash', (hash) => {
        emitter.emit(eeConstants.LOGIN_TRANSACTION_HASH, hash);
      })
      .on('confirmation', (confirmationNumber, receipt) => {
        emitter.emit(eeConstants.LOGIN_CONFIRMATION, confirmationNumber, receipt);
      })
      .on('receipt', (receipt) => {
        emitter.emit(eeConstants.LOGIN_RECEIPT, receipt);
      })
      .on('error', (err) => {
        emitter.emit(eeConstants.ERROR, err);
      });
    return emitter;
  }

  /**
   * Logout workers.
   *
   * @param {Object} options
   * @return {Promise}
   */
  logout(options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    let emitter = new EventEmitter();
    this.enigmaContract.methods.logout().send(options)
      .on('transactionHash', (hash) => {
        emitter.emit('logoutTransactionHash', hash);
      })
      .on('confirmation', (confirmationNumber, receipt) => {
        emitter.emit('logoutConfirmation', confirmationNumber, receipt);
      })
      .on('receipt', (receipt) => {
        emitter.emit('logoutReceipt', receipt);
      })
      .on('error', (err) => {
        emitter.emit('error', err);
      });
    return emitter;
  }

  /**
   * Deposit ENG tokens in the worker's bank
   *
   * @param {string} account
   * @param {number} amount
   * @param {Object} options
   * @return {EventEmitter}
   */
  deposit(account, amount, confirmation=false, options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    options.from = account;
    let emitter = new EventEmitter();
    (async () => {
      const balance = await this.tokenContract.methods.balanceOf(account).call();
      if (balance < amount) {
        const msg = 'Not enough tokens in wallet';
        emitter.emit('error', {
          name: 'NotEnoughTokens',
          message: msg,
        });
        return;
      }
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, amount).send(options);
      const allowance = await this.tokenContract.methods.allowance(account, this.enigmaContract.options.address).call();
      if (allowance < amount) {
        const msg = 'Not enough tokens approved: ' + allowance + '<' + amount;
        emitter.emit('error', {
          name: 'NotEnoughApprovedTokens',
          message: msg,
        });
        return;
      }

      await this.enigmaContract.methods.deposit(account, amount).send(options)
        .on('transactionHash', (hash) => {
          emitter.emit(eeConstants.DEPOSIT_TRANSACTION_HASH, hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit(eeConstants.DEPOSIT_CONFIRMATION, confirmationNumber, receipt);
        })
        .on('receipt', (receipt) => {
          emitter.emit(eeConstants.DEPOSIT_RECEIPT, receipt);
        });
    })();
    return emitter;
  }

  /**
   * Logout workers.
   *
   * @param {string} account
   * @param {Object} options
   * @return {Promise}
   */
  getStakedBalance(account, options = {}) {
    let emitter = new EventEmitter();
    (async () => {
      const worker = await this.enigmaContract.methods.workers(account).call();
      emitter.emit(eeConstants.GET_STAKED_BALANCE_RESULT, parseInt(worker.balance));
    })();
    return emitter;
  }
}
