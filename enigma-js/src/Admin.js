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
   * Find worker by signing address
   *
   * @param {string} sigAddr - The signing address
   * @return {Promise} Resolves to worker's details
   */
  async findBySigningAddress(sigAddr) {
    const result = await this.enigmaContract.methods.getWorkerFromSigningAddress(sigAddr).call();
    return {
      account: result[0],
      status: parseInt(result[1][1]),
      report: result[1][2],
      balance: parseInt(result[1][3]),
      logs: result[1][4],
    };
  }

  /**
   * Get the worker's status
   *
   * @param {string} account - Worker's ETH address
   * @return {Promise} Resolves to status of worker (0=Unregistered, 1=LoggedIn, 2=LoggedOut)
   */
  async getWorkerStatus(account) {
    const worker = await this.enigmaContract.methods.getWorker(account).call();
    return parseInt(worker.status);
  }

  /**
   * Checks if a secret contract is deployed
   *
   * @param {string} scAddr - Secret contract address
   * @return {Promise} Resolves to a boolean value whether the contract has been deployed or not
   */
  async isDeployed(scAddr) {
    return parseInt((await this.enigmaContract.methods.getSecretContract(scAddr).call()).status) === 1;
  }

  /**
   * Count the number of deployed secret contracts.
   *
   * @return {Promise} - Resolves to number of deployed secret contracts
   */
  async countSecretContracts() {
    return parseInt(await this.enigmaContract.methods.countSecretContracts().call());
  }

  /**
   * Get the addresses of deployed secret contracts within a specified range.
   *
   * @param {number} start - Start index of secret contract address to retrieve (inclusive)
   * @param {number} stop - Stop index of secret contract address to retrieve (exclusive)
   * @return {Promise} - Resolves to the addresses of deployed secret contracts within range
   */
  async getSecretContractAddresses(start, stop) {
    return (await this.enigmaContract.methods.getSecretContractAddresses(start, stop).call());
  }

  /**
   * Get the addresses of all deployed secret contracts.
   *
   * @return {Promise} - Resolves to the addresses of deployed secret contracts within range
   */
  async getAllSecretContractAddresses() {
    return (await this.enigmaContract.methods.getAllSecretContractAddresses().call());
  }

  /**
   * Fetches the secret contract bytecode hash
   *
   * @param {string} scAddr - Secret contract address
   * @return {Promise} - Resolves to the bytecode hash of the deployed secret contract
   */
  async getCodeHash(scAddr) {
    return (await this.enigmaContract.methods.getSecretContract(scAddr).call()).codeHash;
  }

  /**
   * Count the state deltas for the specified secret contract.
   *
   * @param {string} scAddr - Secret contract address
   * @return {Promise} - Resolves to count of state deltas
   */
  async countStateDeltas(scAddr) {
    return (await this.enigmaContract.methods.getSecretContract(scAddr).call()).stateDeltaHashes.length;
  }

  /**
   * Fetch the state delta hash at the specified index position
   *
   * @param {string} scAddr - Secret contract address
   * @param {number} index - Index of state delta hash to retrieve
   * @return {Promise} - Resolves to state delta hash at the specified position
   */
  async getStateDeltaHash(scAddr, index) {
    return (await this.enigmaContract.methods.getSecretContract(scAddr).call()).stateDeltaHashes[index];
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
    return (await this.enigmaContract.methods.getSecretContract(scAddr).call()).stateDeltaHashes.slice(start, stop);
  }

  /**
   * Check that the specified state delta hash is valid.
   *
   * @param {string} scAddr - Secret contract address
   * @param {string} stateDeltaHash - State delta hash for a given task
   * @return {Promise} Resolves to boolean value for whether the state delta hash is valid
   */
  async isValidDeltaHash(scAddr, stateDeltaHash) {
    return (await this.enigmaContract.methods.getSecretContract(scAddr).call()).stateDeltaHashes.includes(
      stateDeltaHash);
  }

  /**
   * Login the selected worker
   *
   * @param {string} account - ETH address for worker being logged in
   * @return {EventEmitter} EventEmitter to be listened to track login transaction
   */
  login(account) {
    let emitter = new EventEmitter();
    (async () => {
      try {
        await this.enigmaContract.methods.login().send({from: account}).on('transactionHash', (hash) => {
          emitter.emit(eeConstants.LOGIN_TRANSACTION_HASH, hash);
        }).on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit(eeConstants.LOGIN_CONFIRMATION, confirmationNumber, receipt);
        }).on('receipt', (receipt) => {
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
   * @param {string} account - ETH address for worker being logged out
   * @return {EventEmitter} EventEmitter to be listened to track logout transaction
   */
  logout(account) {
    let emitter = new EventEmitter();
    (async () => {
      try {
        await this.enigmaContract.methods.logout().send({from: account}).on('transactionHash', (hash) => {
          emitter.emit(eeConstants.LOGOUT_TRANSACTION_HASH, hash);
        }).on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit(eeConstants.LOGOUT_CONFIRMATION, confirmationNumber, receipt);
        }).on('receipt', (receipt) => {
          emitter.emit(eeConstants.LOGOUT_RECEIPT, receipt);
        });
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err.message);
      }
    })();
    return emitter;
  }

  /**
   * Deposit ENG tokens in the worker's bank. Worker must be registered prior to this.
   *
   * @param {string} account - Worker's ETH address
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
        const receipt = await this.enigmaContract.methods.deposit(account, amount).
          send({from: account}).
          on('transactionHash', (hash) => {
            emitter.emit(eeConstants.DEPOSIT_TRANSACTION_HASH, hash);
          }).
          on('confirmation', (confirmationNumber, receipt) => {
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
   * Withdraw ENG tokens from the worker's bank. Worker must be in the logged out state and cannot withdraw in the
   * same epoch as logging out.
   *
   * @param {string} account - Worker's ETH address
   * @param {number} amount - Number of ENG tokens to deposit, in grains (10**8 multiplier) format
   * @return {EventEmitter} EventEmitter to be listened to track deposit transaction
   */
  withdraw(account, amount) {
    let emitter = new EventEmitter();
    (async () => {
      try {
        await this.enigmaContract.methods.withdraw(amount).
          send({from: account}).
          on('transactionHash', (hash) => {
            emitter.emit(eeConstants.WITHDRAW_TRANSACTION_HASH, hash);
          }).
          on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit(eeConstants.WITHDRAW_CONFIRMATION, confirmationNumber, receipt);
          }).
          on('receipt', (receipt) => {
            emitter.emit(eeConstants.WITHDRAW_RECEIPT, receipt);
          });
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err.message);
      }
    })();
    return emitter;
  }

  /**
   * Get token balance for worker
   *
   * @param {string} account - Worker's ETH address
   * @return {Promise} Resolves to ENG token balance in grains (10**8 multiplier) format
   */
  async getBalance(account) {
    return parseInt((await this.enigmaContract.methods.getWorker(account).call()).balance);
  }

  /**
   * Get worker's signer address
   *
   * @param {string} account - Worker's ETH address
   * @return {Promise} Resolves to worker's signer address
   */
  async getWorkerSignerAddr(account) {
    return (await this.enigmaContract.methods.getWorker(account).call()).signer;
  }
}
