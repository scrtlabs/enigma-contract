import EventEmitter from 'eventemitter3';
import utils from 'enigma-utils';

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
    this.enigmaContract.methods.workers(account).call()
      .then((worker) => {
        let workerStatus = worker.status;
        emitter.emit('workerStatus', workerStatus);
      });
    return emitter;
  }

  /**
   * Deploy a secret contract to Ethereum
   *
   * @param {string} codeHash
   * @param {string} owner
   * @param {Array} inputs
   * @param {string} sig
   * @param {Object} options
   * @return {EventEmitter}
   */
  deploySecretContract(codeHash, owner, inputs, sig, options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    let emitter = new EventEmitter();
    let scAddr = '0x' + this.web3.utils.soliditySha3(utils.encodeArguments([codeHash, owner, 0])).slice(-40);
    console.log(`Deploying secret contract at address ${scAddr}`);
    let blockNumber;
    let contractSelectedWorker;
    let clientPrivateKey;
    let encryptedInputs;
    let nonce;
    // Deploy to ETH
    this.enigmaContract.methods.userSCDeployments(owner).call()
      .then((userNonce) => {
        console.log('1. Obtained nonce for user:', userNonce);
        nonce = userNonce;
      })
      .then(() => {
        return this.enigmaContract.methods.deploySecretContract(scAddr, codeHash, owner, sig).send(options)
          .on('transactionHash', (hash) => {
            console.log('got tx hash', hash);
            emitter.emit('deployETHTransactionHash', hash);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit('deployETHConfirmation', confirmationNumber, receipt);
          })
          .on('receipt', (receipt) => {
            console.log('got task record receipt', receipt);
            emitter.emit('deployETHReceipt', receipt);
          })
          .on('error', (err) => emitter.emit('error', err));
      });

    // Deploy to ENG network
    this.web3.eth.getBlockNumber()
      .then((bn) => {
        blockNumber = bn;
        return this.enigma.getWorkerParams(blockNumber);
      })
      .then((params) => {
        contractSelectedWorker = this.enigma.selectWorkerGroup(blockNumber, scAddr, params, 5)[0];
        return contractSelectedWorker;
      })
      .then((contractSelectedWorker) => {
        console.log('1. Selected worker:', contractSelectedWorker);
        return new Promise((resolve, reject) => {
          this.enigma.client.request('getWorkerEncryptionKey', [contractSelectedWorker], (err, error, result) => {
            if (err) {
              reject(err);
            }
            resolve(result);
          });
        });
      })
      .then((getWorkerEncryptionKeyResult) => {
        let enclavePublicKey = getWorkerEncryptionKeyResult[0];
        let enclaveSig = getWorkerEncryptionKeyResult[1];
        // TODO: verify signature
        return enclavePublicKey;
      })
      .then((enclavePublicKey) => {
        console.log('2. Got worker encryption key:', enclavePublicKey);
        // TODO: generate client key pair
        clientPrivateKey = '853ee410aa4e7840ca8948b8a2f67e9a1c2f4988ff5f4ec7794edf57be421ae5';
        let derivedKey = utils.getDerivedKey(enclavePublicKey, clientPrivateKey);
        encryptedInputs = inputs.map((input) => utils.encryptMessage(derivedKey, input));
      })
      .then(() => {
        console.log('3. Encrypted inputs:', encryptedInputs);
        const msg = this.web3.utils.soliditySha3(
          {t: 'bytes', v: codeHash},
          {t: 'bytes', v: utils.encodeArguments(encryptedInputs)},
        );
        const sig = utils.sign(clientPrivateKey, msg);
        console.log('4. Signed bytecode hash and RLP-encoded encrypted inputs:', sig);
        return sig;
      })
      .then((sig) => {
        return new Promise((resolve, reject) => {
          this.enigma.client.request('deploySecretContract', [encryptedInputs, sig], (err, error, result) => {
            if (err) {
              reject(err);
            }
            resolve(result);
          });
        });
      })
      .then((deploySecretContractResult) => {
        emitter.emit('deployENGReceipt', deploySecretContractResult);
      });
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
        emitter.emit('loginTransactionHash', hash);
      })
      .on('confirmation', (confirmationNumber, receipt) => {
        emitter.emit('loginConfirmation', confirmationNumber, receipt);
      })
      .on('receipt', (receipt) => {
        emitter.emit('loginReceipt', receipt);
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
