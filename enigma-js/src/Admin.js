import EventEmitter from 'eventemitter3';
import * as eeConstants from './emitterConstants';

/**
 * Encapsulates the admin operations
 */
export default class Admin {
  /**
   * Constructor
   * @param {Web3} web3 - Web3 provider for the library
   * @param {Web3.Contract} enigmaContract - Enigma contract deployed to Ethereum
   * @param {Web3.Contract} tokenContract - Enigma token contract deployed to Ethereum
   * @param {Object} txDefaults
   * @param {Enigma} enigma - Enigma wrapper instance
   */
  constructor(web3, enigmaContract, tokenContract, txDefaults, enigma) {
    this.web3 = web3;
    this.enigmaContract = enigmaContract;
    this.tokenContract = tokenContract;
    this.txDefaults = txDefaults;
    this.enigma = enigma;
  }

  /**
   * Get the worker's status
   *
   * @param {string} account - Worker's address
   * @return {Promise} Resolves to status of worker (0=Unregistered, 1=Registered, 2=LoggedIn, 3=LoggedOut)
   */
  async getWorkerStatus(account) {
    const worker = await this.enigmaContract.methods.workers(account).call();
    return parseInt(worker.status);
  }

  /**
   * Checks if a secret contract is deployed
   *
   * @param {string} scAddr - Secret contract address
   * @return {Promise} Resolves to a boolean value whether the contract has been deployed or not
   */
  async isDeployed(scAddr) {
    return await this.enigmaContract.methods.isDeployed(scAddr).call();
  }

  /**
   * Fetches the secret contract bytecode hash
   *
   * @param {string} scAddr - Secret contract address
   * @return {Promise} - Resolves to the bytecode hash of the deployed secret contract
   */
  async getCodeHash(scAddr) {
    return (await this.enigmaContract.methods.contracts(scAddr).call()).codeHash;
  }

  /**
   * Count the state deltas for the specified secret contract.
   *
   * @param {string} scAddr - Secret contract address
   * @return {Promise} - Resolves to count of state deltas
   */
  async countStateDeltas(scAddr) {
    return parseInt(await this.enigmaContract.methods.countStateDeltas(scAddr).call());
  }

  /**
   * Fetch the state delta hash at the specified index position
   *
   * @param {string} scAddr - Secret contract address
   * @param {number} index - Index of state delta hash to retrieve
   * @return {Promise} - Resolves to state delta hash at the specified position
   */
  async getStateDeltaHash(scAddr, index) {
    return await this.enigmaContract.methods.getStateDeltaHash(scAddr, index).call();
  }

  /**
   * Fetch state delta hashes in the specified range
   *
   * @param {string} scAddr - Secret contract address
   * @param {number} start - Start index of state delta hash to retrieve (inclusive)
   * @param {number} stop - Stop index of state delta hash to retrieve (exclusive)
   * @return {Promise} - Resolves to the state delta hashes in the specified range
   */
  async getStateDeltaHashes(scAddr, start, stop) {
    return await this.enigmaContract.methods.getStateDeltaHashes(scAddr, start, stop).call();
  }

  /**
   * Check that the specified state delta hash is valid.
   *
   * @param {string} scAddr - Secret contract address
   * @param {string} stateDeltaHash
   * @return {Promise} Resolves to boolean value for whether the state delta hash is valid
   */
  async isValidDeltaHash(scAddr, stateDeltaHash) {
    return await this.enigmaContract.methods.isValidDeltaHash(scAddr, stateDeltaHash).call();
  }

  /**
   * Login the selected worker
   *
   * @param {string} account
   * @return {EventEmitter} EventEmitter to be listened to track login transaction
   */
  login(account) {
    let emitter = new EventEmitter();
    (async () => {
      try {
        await this.enigmaContract.methods.login().send({from: account})
          .on('transactionHash', (hash) => {
            emitter.emit(eeConstants.LOGIN_TRANSACTION_HASH, hash);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit(eeConstants.LOGIN_CONFIRMATION, confirmationNumber, receipt);
          })
          .on('receipt', (receipt) => {
            emitter.emit(eeConstants.LOGIN_RECEIPT, receipt);
          });
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err.message);
      }
    })();
    return emitter;
  }

  /**
   * Logout the selected worker
   *
   * @param {string} account
   * @return {EventEmitter} EventEmitter to be listened to track logout transaction
   */
  logout(account) {
    let emitter = new EventEmitter();
    (async () => {
      try {
        await this.enigmaContract.methods.logout().send({from: account})
          .on('transactionHash', (hash) => {
            emitter.emit(eeConstants.LOGOUT_TRANSACTION_HASH, hash);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit(eeConstants.LOGOUT_CONFIRMATION, confirmationNumber, receipt);
          })
          .on('receipt', (receipt) => {
            emitter.emit(eeConstants.LOGOUT_RECEIPT, receipt);
          });
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err.message);
      }
    })();
    return emitter;
  }

  /**
   * Deposit ENG tokens in the worker's bank
   *
   * @param {string} account - Worker's address
   * @param {number} amount - Number of ENG tokens to deposit, in grains (10**8 multiplier) format
   * @return {EventEmitter} EventEmitter to be listened to track deposit transaction
   */
  deposit(account, amount) {
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
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, amount).send({from: account});
      try {
        const receipt = await this.enigmaContract.methods.deposit(account, amount).send({from: account})
          .on('transactionHash', (hash) => {
            emitter.emit(eeConstants.DEPOSIT_TRANSACTION_HASH, hash);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit(eeConstants.DEPOSIT_CONFIRMATION, confirmationNumber, receipt);
          });
        emitter.emit(eeConstants.DEPOSIT_RECEIPT, receipt);
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err.message);
      }
    })();
    return emitter;
  }

  /**
   * Withdraw ENG tokens from the worker's bank
   *
   * @param {string} account - Worker's address
   * @param {number} amount - Number of ENG tokens to deposit, in grains (10**8 multiplier) format
   * @return {EventEmitter} EventEmitter to be listened to track deposit transaction
   */
  withdraw(account, amount) {
    let emitter = new EventEmitter();
    (async () => {
      try {
        await this.enigmaContract.methods.withdraw(account, amount).send({from: account})
          .on('transactionHash', (hash) => {
            emitter.emit(eeConstants.WITHDRAW_TRANSACTION_HASH, hash);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit(eeConstants.WITHDRAW_CONFIRMATION, confirmationNumber, receipt);
          })
          .on('receipt', (receipt) => {
            emitter.emit(eeConstants.WITHDRAW_RECEIPT, receipt);
          });
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err.message);
      }
    })();
    return emitter;
  }

  /**
   * Get staked token balance for worker
   *
   * @param {string} account - Worker's address
   * @return {Promise} Resolves to staked ENG token balance in grains (10**8 multiplier) format
   */
  async getStakedBalance(account) {
    return parseInt((await this.enigmaContract.methods.workers(account).call()).balance);
  }
}
