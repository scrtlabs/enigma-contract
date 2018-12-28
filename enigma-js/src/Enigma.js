/* eslint-disable prefer-spread,prefer-rest-params,valid-jsdoc */
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import Admin from './Admin';
import TaskRecord from './models/TaskRecord';
import TaskResult from './models/TaskResult';
import TaskInput from './models/TaskInput';
import EventEmitter from 'eventemitter3';
import web3Utils from 'web3-utils';
import jaysonBrowserClient from 'jayson/lib/client/browser';
import axios from 'axios';
import utils from './enigma-utils';
import forge from 'node-forge';
import EthCrypto from 'eth-crypto';
import * as eeConstants from './emitterConstants';


/**
 * Class encapsulation the Enigma operations.
 */
export default class Enigma {
  /**
   * The Enigma JS library constructor - a wrapper for Ethereum's Web3 library, offering additional services to
   * leverage the Enigma protocol's unique features.
   *
   * @param {Web3} web3 - Web3 provider for the library
   * @param {string} enigmaContractAddr - Address the Enigma contract is deployed to on Ethereum
   * @param {string} tokenContractAddr - Address the Enigma token contract is deployed to on Ethereum
   * @param {string} rpcAddr - Enigma p2p network address for RPC calls
   * @param {Object} txDefaults
   */
  constructor(web3, enigmaContractAddr, tokenContractAddr, rpcAddr, txDefaults = {}) {
    this.web3 = web3;
    this.txDefaults = txDefaults;
    let callServer = function(request, callback) {
      let config = {
        headers: {
          'Content-Type': 'application/json',
          'credentials': 'include',
        },
      };
      axios.post(rpcAddr, JSON.parse(request), config)
        .then((response) => {
          if ('error' in response.data) {
            throw (response.data.error);
          }
          return JSON.stringify(response.data.result);
        })
        .then((text) => {
          callback(null, text);
        })
        .catch(function(err) {
          callback(err, null);
        });
    };
    this.client = jaysonBrowserClient(callServer, {});
    this.workerParamsCache = {};
    this.selectedWorkerGroupCache = {};
    this.createContracts(enigmaContractAddr, tokenContractAddr);
  }

  /**
   * Initialize the worker-specific admin features
   */
  admin() {
    this.admin = new Admin(this.web3, this.enigmaContract, this.tokenContract, this.txDefaults, this);
  }

  /**
   * Initialize the Enigma and Enigma token contracts
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
   * Deploy a secret contract to both the Ethereum and Enigma networks
   *
   * @param {string} compiledBytecodeHash - Hash of the contract bytecode's compiled down to WASM
   * @param {string} owner - Owner/deployer of secret contract
   * @param {Array} args - Constructor args used for secret contract initialization
   * @param {Object} options
   * @return {EventEmitter}
   */
  deploySecretContract(compiledBytecodeHash, owner, args, options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    let emitter = new EventEmitter();
    (async () => {
      const nonce = await this.enigmaContract.methods.userSCDeployments(owner).call();
      const scAddr = this.web3.utils.soliditySha3(
        {t: 'bytes32', v: compiledBytecodeHash},
        {t: 'address', v: owner},
        {t: 'uint', v: nonce},
      );
      emitter.emit(eeConstants.DEPLOY_SC_ADDR_RESULT, scAddr);
      const proof = this.web3.utils.soliditySha3(
        {t: 'bytes', v: compiledBytecodeHash},
      );
      const userDeployETHSig = await this.web3.eth.sign(proof, owner);

      this.enigmaContract.methods.deploySecretContract(scAddr, compiledBytecodeHash, owner, userDeployETHSig)
        .send(options)
        .on('transactionHash', (hash) => {
          emitter.emit(eeConstants.DEPLOY_SC_ETH_TRANSACTION_HASH, hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit(eeConstants.DEPLOY_SC_ETH_CONFIRMATION, confirmationNumber, receipt);
        })
        .on('receipt', (receipt) => {
          emitter.emit(eeConstants.DEPLOY_SC_ETH_RECEIPT, receipt);
        })
        .on('error', (err) => emitter.emit(eeConstants.ERROR, err));

      const blockNumber = await this.web3.eth.getBlockNumber();
      const workerParams = await this.getWorkerParams(blockNumber);
      const workerAddress = await this.selectWorkerGroup(blockNumber, scAddr, workerParams, 5)[0];
      const getWorkerEncryptionKeyResult = await new Promise((resolve, reject) => {
        this.client.request('getWorkerEncryptionKey', {workerAddress}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      });
      const {workerEncryptionKey, workerSig} = getWorkerEncryptionKeyResult;
      if (workerEncryptionKey !== utils.recoverPublicKey(workerSig,
        this.web3.utils.soliditySha3({t: 'bytes', v: workerEncryptionKey}))) {
        emitter.emit(eeConstants.ERROR, {
          name: 'InvalidWorker',
          message: 'Invalid worker encryption key + signature combo',
        });
        return;
      }
      const {publicKey, privateKey} = this.obtainTaskKeyPair();
      console.log('public key', publicKey);
      const derivedKey = utils.getDerivedKey(workerEncryptionKey, privateKey);
      const encodedArgs = utils.encodeArguments(args);
      const encryptedEncodedArgs = utils.encryptMessage(derivedKey, encodedArgs);
      const msg = this.web3.utils.soliditySha3(
        {t: 'bytes', v: compiledBytecodeHash},
        {t: 'bytes', v: encryptedEncodedArgs},
      );
      const userDeployENGSig = await this.web3.eth.sign(msg, owner);
      const deploySecretContractResult = await new Promise((resolve, reject) => {
        this.client.request('deploySecretContract', {compiledBytecodeHash, encryptedEncodedArgs, userDeployENGSig},
          (err, response) => {
            if (err) {
              reject(err);
            }
            resolve(response);
          });
      });
      emitter.emit(eeConstants.DEPLOY_SC_ENG_RECEIPT, deploySecretContractResult);
    })();
    return emitter;
  }

  /**
   * Create and store a task record on chain. Task records are necessary for collecting the ENG computation fee and
   * storing the immutable task id. Thus, task records have important implications for task ordering, fee payments,
   * and verification.
   *
   * @param {Object} taskInput - The task input wrapper from which the record will be created
   * @returns {EventEmitter} EventEmitter to be listened to track creation of TaskRecord
   */
  createTaskRecord(taskInput) {
    let emitter = new EventEmitter();
    (async () => {
      let taskRecord = new TaskRecord(taskInput.taskId, taskInput.fee);
      const balance = await this.tokenContract.methods.balanceOf(this.txDefaults.from).call();
      if (balance < taskInput.fee) {
        emitter.emit('error', {
          name: 'NotEnoughTokens',
          message: 'Not enough tokens to pay the fee',
        });
        return;
      }
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, taskInput.fee)
        .send(this.txDefaults);
      await this.enigmaContract.methods.createTaskRecord(taskInput.taskId, taskInput.fee).send(this.txDefaults)
        .on('transactionHash', (hash) => {
          taskRecord.transactionHash = hash;
          emitter.emit(eeConstants.CREATE_TASK_RECORD_TRANSACTION_HASH, hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit(eeConstants.CREATE_TASK_RECORD_CONFIRMATION, confirmationNumber, receipt);
        })
        .then((receipt) => {
          taskRecord.receipt = receipt;
          taskRecord.status = 1;
          emitter.emit(eeConstants.CREATE_TASK_RECORD_RECEIPT, receipt);
          emitter.emit(eeConstants.CREATE_TASK_RECORD, taskRecord);
        });
    })();
    return emitter;
  }

  /**
   * Create and store multiple task records on chain. Task records are necessary for collecting the ENG computation fee
   * and storing the immutable task id. Thus, task records have important implications for task ordering, fee payments,
   * and verification.
   *
   * @param {Array} taskInputs - The task input wrappers from which the record will be created
   * @returns {EventEmitter} EventEmitter to be listened to track creation of TaskRecords
   */
  createTaskRecords(taskInputs) {
    let emitter = new EventEmitter();
    (async () => {
      let taskIds = [];
      let fees = [];
      let taskRecords = [];
      taskInputs.forEach((taskInput) => {
        taskIds.push(taskInput.taskId);
        fees.push(taskInput.fee);
        taskRecords.push(new TaskRecord(taskInput.taskId, taskInput.fee));
      });
      const balance = await this.tokenContract.methods.balanceOf(this.txDefaults.from).call();
      const totalFees = fees.reduce((a, b) => a + b, 0);
      if (balance < totalFees) {
        emitter.emit(eeConstants.ERROR, {
          name: 'NotEnoughTokens',
          message: 'Not enough tokens to pay the fee',
        });
        return;
      }
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, totalFees).send(this.txDefaults);
      await this.enigmaContract.methods.createTaskRecords(taskIds, fees).send(this.txDefaults)
        .on('transactionHash', (hash) => {
          for (let i = 0; i < taskRecords.length; i++) {
            taskRecords[i].transactionHash = hash;
          }
          emitter.emit(eeConstants.CREATE_TASK_RECORDS_TRANSACTION_HASH, hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit(eeConstants.CREATE_TASK_RECORDS_CONFIRMATION, confirmationNumber, receipt);
        })
        .then((receipt) => {
          for (let i = 0; i < taskRecords.length; i++) {
            taskRecords[i].receipt = receipt;
            taskRecords[i].status = 1;
          }
          emitter.emit(eeConstants.CREATE_TASK_RECORDS_RECEIPT, receipt);
          emitter.emit(eeConstants.CREATE_TASK_RECORDS, taskRecords);
        });
    })();
    return emitter;
  }

  /**
   * Get the task record's status from Ethereum
   *
   * @param {TaskRecord} taskRecord - A task record wrapper stored on Ethereum
   * @return {Promise} Resolves to TaskRecord wrapper with updated status and proof properties
   */
  async getTaskRecordStatus(taskRecord) {
    const result = await this.enigmaContract.methods.tasks(taskRecord.taskId).call();
    taskRecord.status = parseInt(result.status);
    taskRecord.proof = result.proof;
    return taskRecord;
  }

  /**
   * Find SGX report
   * @param {string} custodian - Worker's address
   * @return {Promise} Resolves to SGX report for the worker
   */
  async getReport(custodian) {
    return await this.enigmaContract.methods.getReport(custodian).call();
  }

  /**
   * Given the current block number, obtain the worker parameters. These parameters remain the same for a given secret
   * contract and epoch (fixed number of blocks). These parameters are cached until the epoch changes.
   * @param {int} blockNumber
   * @return {Promise} Resolves to the worker params, which includes a seed (random int generated from the principal
   * node), first block number for the epoch, list of active work addresses (ordered list of workers that were logged
   * in at the start of the epoch), and list of active worker balances
   */
  async getWorkerParams(blockNumber) {
    let epochSize = await this.enigmaContract.methods.epochSize().call();
    if ((Object.keys(this.workerParamsCache).length === 0) ||
      (blockNumber - this.workerParamsCache.firstBlockNumber >= epochSize)) {
      const getWorkerParamsResult = await this.enigmaContract.methods.getWorkerParams(blockNumber).call();
      this.workerParamsCache = {
        firstBlockNumber: parseInt(getWorkerParamsResult[0]),
        seed: parseInt(getWorkerParamsResult[1]),
        workers: getWorkerParamsResult[2],
        balances: getWorkerParamsResult[3].map((x) => parseInt(x)),
      };
    }
    return this.workerParamsCache;
  }

  /**
   * Select the workers weighted-randomly based on the staked token amount that will run the computation task
   * @param {number} blockNumber - Current block number
   * @param {string} scAddr - Secret contract address
   * @param {Object} params - Worker params
   * @param {number} workerGroupSize - Number of workers to be selected for task
   * @return {Array} An array of selected workers where each selected worker is chosen with probability equal to
   * number of staked tokens
   */
  selectWorkerGroup(blockNumber, scAddr, params, workerGroupSize = 5) {
    let tokenCpt = params.balances.reduce((a, b) => a + b, 0);
    let nonce = 0;
    let selectedWorkers = [];
    do {
      const hash = web3Utils.soliditySha3(
        {t: 'uint256', v: blockNumber},
        {t: 'uint256', v: params.seed},
        {t: 'uint256', v: params.firstBlockNumber},
        {t: 'bytes32', v: scAddr},
        {t: 'uint256', v: tokenCpt},
        {t: 'uint256', v: nonce},
      );
      let randVal = (web3Utils.toBN(hash).mod(web3Utils.toBN(tokenCpt))).toNumber();
      let selectedWorker = params.workers[params.workers.length - 1];
      for (let i = 0; i < params.workers.length; i++) {
        randVal -= params.balances[i];
        if (randVal <= 0) {
          selectedWorker = params.workers[i];
          break;
        }
      }
      if (!selectedWorkers.includes(selectedWorker)) {
        selectedWorkers.push(selectedWorker);
      }
      nonce++;
    }
    while (selectedWorkers.length < workerGroupSize);
    return selectedWorkers;
  }

  /**
   * Create a TaskInput, a collection of attributes, to be submitted to the Enigma network
   *
   * @param {string} fn - ABI compliant signature of the function
   * @param {Array} args - Inputs for function
   * @param {string} scAddr - Address of secret contract
   * @param {string} sender - Ethereum address of dApp user
   * @param {string} userPubKey - Associated public key of dApp user used for encryption of task inputs
   * @param {Number} fee - ENG fee for task computation
   * @return {EventEmitter} EventEmitter to be listened to track creation of TaskInput
   */
  createTaskInput(fn, args, scAddr, sender, userPubKey, fee) {
    let emitter = new EventEmitter();
    (async () => {
      const creationBlockNumber = await this.web3.eth.getBlockNumber();
      let taskInput = new TaskInput(creationBlockNumber, sender, scAddr, fn, args, userPubKey, fee);
      const workerParams = await this.getWorkerParams(creationBlockNumber);
      const workerAddress = await this.selectWorkerGroup(creationBlockNumber, scAddr, workerParams, 5)[0];
      const getWorkerEncryptionKeyResult = await new Promise((resolve, reject) => {
        this.client.request('getWorkerEncryptionKey', {workerAddress}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      });
      const {workerEncryptionKey, workerSig} = getWorkerEncryptionKeyResult;
      if (workerEncryptionKey !== utils.recoverPublicKey(workerSig,
        this.web3.utils.soliditySha3({t: 'bytes', v: workerEncryptionKey}))) {
        emitter.emit(eeConstants.ERROR, {
          name: 'InvalidWorker',
          message: 'Invalid worker encryption key + signature combo',
        });
        return;
      }
      const {publicKey, privateKey} = this.obtainTaskKeyPair();
      console.log('public key', publicKey);
      const derivedKey = utils.getDerivedKey(workerEncryptionKey, privateKey);
      const encodedArgs = utils.encodeArguments(args);
      taskInput.encryptedFn = utils.encryptMessage(derivedKey, fn);
      taskInput.encryptedEncodedArgs = utils.encryptMessage(derivedKey, encodedArgs);
      const msg = this.web3.utils.soliditySha3(
        {t: 'bytes', v: taskInput.encryptedFn},
        {t: 'bytes', v: taskInput.encryptedEncodedArgs},
      );
      taskInput.userTaskSig = await this.web3.eth.sign(msg, sender);
      emitter.emit(eeConstants.CREATE_TASK_INPUT, taskInput);
    })();
    return emitter;
  }

  /**
   * Send TaskInput to Enigma p2p network for computation
   *
   * @param {TaskInput} taskInput - Task input wrapper
   * @return {EventEmitter} EventEmitter to be listened to track submission of TaskInput to Enigma p2p network
   */
  sendTaskInput(taskInput) {
    let emitter = new EventEmitter();
    (async () => {
      const sendTaskInputResult = await new Promise((resolve, reject) => {
        this.client.request('sendTaskInput', Enigma.serializeTaskInput(taskInput), (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      });
      emitter.emit(eeConstants.SEND_TASK_INPUT_RESULT, sendTaskInputResult);
    })();
    return emitter;
  }

  /**
   * Generator function for polling the Enigma p2p network for task status
   *
   * @param {TaskInput} taskInput - Task input wrapper
   */
  * pollTaskInputGen(taskInput) {
    while (true) {
      yield new Promise((resolve, reject) => {
        this.client.request('pollTaskInput', {taskId: taskInput.taskId}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(new TaskResult(response.taskId, response.encryptedEncodedOutputs, response.sig,
            response.status));
        });
      });
    }
  }

  /**
   * Inner poll status function that continues to poll the Enigma p2p network until the task has been verified
   *
   * @param {TaskInput} taskInput - Task input wrapper
   * @param {pollTaskInputGen} generator - Generator function for polling Enigma p2p network for task status
   * @param {EventEmitter} emitter - EventEmitter to track Enigma p2p network polling for TaskInput status
   */
  innerPollTaskInput(taskInput, generator, emitter) {
    let p = generator.next();
    p.value.then((d) => {
      emitter.emit(eeConstants.POLL_TASK_INPUT_RESULT, d);
      if (d.status !== 2) {
        this.innerPollTaskInput(taskInput, generator, emitter);
      }
    });
  }

  /**
   * Poll the Enigma p2p network for a TaskInput's status
   *
   * @param {TaskInput} taskInput - A task input wrapper
   * @return {EventEmitter} EventEmitter to be listened to track polling the Enigma p2p network for a TaskInput status
   */
  pollTaskInput(taskInput) {
    let emitter = new EventEmitter();
    let generator = this.pollTaskInputGen(taskInput);
    this.innerPollTaskInput(taskInput, generator, emitter);
    return emitter;
  }

  /**
   * Serialize TaskInput for submission to the Enigma p2p network
   *
   * @param {TaskInput} taskInput - A task input wrapper
   * @return {Object} Serialized TaskInput for submission to the Enigma p2p network
   */
  static serializeTaskInput(taskInput) {
    return {taskId: taskInput.taskId, creationBlockNumber: taskInput.creationBlockNumber, sender: taskInput.sender,
      scAddr: taskInput.scAddr, encryptedFn: taskInput.encryptedFn,
      encryptedEncodedArgs: taskInput.encryptedEncodedArgs, userTaskSig: taskInput.userTaskSig,
      userPubKey: taskInput.userPubKey, fee: taskInput.fee};
  }

  /**
   * Deterministically generate a key-secret pair necessary for deriving a shared encryption key with the selected
   * worker. This pair will be stored in local storage for quick retrieval.
   *
   * @return {Object} Public key-private key pair
   */
  obtainTaskKeyPair() {
    let privateKey;
    let encodedPrivateKey = window.localStorage.getItem('encodedPrivateKey');
    if (encodedPrivateKey == null) {
      let random = forge.random.createInstance();
      random.seedFileSync = function(needed) {
        return forge.util.fillString('cupcake', needed);
      };
      privateKey = forge.util.bytesToHex(random.getBytes(32));
      window.localStorage.setItem('encodedPrivateKey', btoa(privateKey));
    } else {
      privateKey = atob(encodedPrivateKey);
    }
    let publicKey = EthCrypto.publicKeyByPrivateKey(privateKey);
    return {publicKey, privateKey};
  }

  /**
   * Return the version number of the library
   *
   * @return {string}
   */
  static version() {
    return '0.0.1';
  }
}
