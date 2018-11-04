import EventEmitter from 'eventemitter3';

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
   */
  constructor(web3, enigmaContract, tokenContract, txDefaults) {
    this.web3 = web3;
    this.enigmaContract = enigmaContract;
    this.tokenContract = tokenContract;
    this.txDefaults = txDefaults;
  }

  /**
   * Deploy a secret contract to Ethereum
   *
   * @param {string} scAddr
   * @param {string} codeHash
   * @param {string} owner
   * @param {string} sig
   * @param {Object} options
   * @return {EventEmitter}
   */
  deploySecretContract(scAddr, codeHash, owner, sig, options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    let emitter = new EventEmitter();
    this.enigmaContract.methods.deploySecretContract(scAddr, codeHash, owner, sig).
      send(options).
      on('transactionHash', (hash) => {
        // console.log('got tx hash', hash);
        emitter.emit('transactionHash', hash);
      }).
      on('receipt', (receipt) => {
        // console.log('got task record receipt', receipt);
        const event = receipt.events.SecretContractDeployed;
        emitter.emit('deployed', event);
      }).
      on('confirmation', (confirmationNumber, receipt) => {
        // console.log('got confirmation', confirmationNumber, receipt);
        const event = receipt.events.SecretContractDeployed;
        emitter.emit('confirmed', event);
      }).
      on('error', (err) => emitter.emit('error', err));
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
   * Deposit ENG tokens in the worker's bank
   *
   * @param {string} account
   * @param {number} amount
   * @param {Object} options
   * @return {EventEmitter}
   */
  deposit(account, amount, options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    options.from = account;
    let emitter = new EventEmitter();
    this.tokenContract.methods.balanceOf(account).call()
      .then((balance) => {
        if (balance < amount) {
          const msg = 'Not enough tokens in wallet';
          emitter.emit('error', {
            name: 'NotEnoughTokens',
            message: msg,
          });
          return;
        }
        return this.tokenContract.methods.approve(this.enigmaContract.options.address, amount).send(options)
          .on('transactionHash', (hash) => {
              emitter.emit('approveTransactionHash', hash);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit('approveConfirmation', confirmationNumber, receipt);
          })
          .on('receipt', (receipt) => {
            emitter.emit('approveReceipt', receipt);
          });
      })
      .then((receipt) => {
        return this.tokenContract.methods.allowance(account, this.enigmaContract.options.address).call();
      })
      .then((allowance) => {
        if (allowance < amount) {
          const msg = 'Not enough tokens approved: ' + allowance + '<' + amount;
          emitter.emit('error', {
            name: 'NotEnoughApprovedTokens',
            message: msg,
          });
          return;
        }
        return this.enigmaContract.methods.deposit(account, amount).send(options)
          .on('transactionHash', (hash) => {
            emitter.emit('depositTransactionHash', hash);
          })
          .on('receipt', (receipt) => {
            emitter.emit('depositReceipt', receipt);
          });
      })
      .catch((err) => {
        emitter.emit('error', err);
      });
    return emitter;
  }
}
