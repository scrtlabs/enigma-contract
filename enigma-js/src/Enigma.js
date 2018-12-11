/* eslint-disable prefer-spread,prefer-rest-params,valid-jsdoc */
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import Admin from './Admin';
import TaskRecord from './models/TaskRecord';
import TaskReceipt from './models/TaskReceipt';
import TaskResult from './models/TaskResult';
import TaskInput from './models/TaskInput';
import EventEmitter from 'eventemitter3';
import web3Utils from 'web3-utils';
import jaysonBrowserClient from 'jayson/lib/client/browser';
import axios from 'axios';
import utils from './enigma-utils';
import forge from 'node-forge';
import EthCrypto from 'eth-crypto';
import * as eeConstants from 'emitterConstants';


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
    let callServer = function(request, callback) {
      let config = {
        headers: {
          'Content-Type': 'application/json',
          'credentials': 'include',
        },
      };
      axios.post('http://localhost:3000', JSON.parse(request), config)
        .then((response) => {
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
   * Initialize the admin features
   */
  admin() {
    this.admin = new Admin(this.web3, this.enigmaContract, this.tokenContract, this.txDefaults, this);
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
   * Deploy a secret contract to Ethereum
   *
   * @param {string} compiledBytecodeHash
   * @param {string} owner
   * @param {Array} args
   * @param {Object} options
   * @return {EventEmitter}
   */
  deploySecretContract(compiledBytecodeHash, owner, args, options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    let emitter = new EventEmitter();
    (async () => {
      const nonce = await this.enigmaContract.methods.userSCDeployments(owner).call();
      const scAddr = this.web3.utils.toChecksumAddress('0x' + this.web3.utils.soliditySha3(
        {t: 'bytes32', v: compiledBytecodeHash},
        {t: 'address', v: owner},
        {t: 'uint', v: nonce},
      ).slice(-40));
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
      // TODO: verify signature
      const {publicKey, privateKey} = this.obtainTaskKeyPair();
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
   * Store a task record on chain
   *
   * @param {Object} taskInput
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
   * Store multiple task records
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
   * Get task record status
   *
   * @param {Object} taskRecord
   */
  async getTaskRecordStatus(taskRecord) {
    const result = await this.enigmaContract.methods.tasks(taskRecord.taskId).call();
    taskRecord.status = parseInt(result.status);
    taskRecord.proof = result.proof;
    return taskRecord;
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
   * @param {string} custodian
   */
  async getReport(custodian) {
    const result = await this.enigmaContract.methods.getReport(custodian).call();
    return result;
  }

  /**
   *
   * @param blockNumber
   * @return {Promise}
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
   * Select the worker group
   *
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
        {t: 'address', v: scAddr},
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
   * Create TaskInput
   *
   * @param {string} fn
   * @param {Array} args
   * @param {string} scAddr
   * @param {string} sender
   * @param {string} userPubKey
   * @param {Number} fee
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
      // TODO: verify signature
      // TODO: generate client key pair
      const {publicKey, privateKey} = this.obtainTaskKeyPair();
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
   * Send TaskInput to p2p network
   *
   * @param {Object} taskInput
   */
  sendTaskInput(taskInput) {
    let emitter = new EventEmitter();
    (async () => {
      const sendTaskInputResult = await new Promise((resolve, reject) => {
        this.client.request('sendTaskInput', this.serializeTaskInput(taskInput), (err, response) => {
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
   * Send TaskInput to p2p network
   *
   * @param {Object} taskInput
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
   * Send TaskInput to p2p network
   *
   * @param {Object} taskInput
   */
  pollTaskInput(taskInput) {
    let emitter = new EventEmitter();
    let generator = this.pollTaskInputGen(taskInput);
    this.innerPollTaskInput(taskInput, generator, emitter);
    return emitter;
  }

  /**
   * Send TaskInput to p2p network
   *
   * @param {Object} taskInput
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
   * Serialize task input
   *
   * @param {Object} taskInput
   */
  serializeTaskInput(taskInput) {
    return {taskId: taskInput.taskId, creationBlockNumber: taskInput.creationBlockNumber, sender: taskInput.sender,
      scAddr: taskInput.scAddr, encryptedFn: taskInput.encryptedFn,
      encryptedEncodedArgs: taskInput.encryptedEncodedArgs, userTaskSig: taskInput.userTaskSig,
      userPubKey: taskInput.userPubKey, fee: taskInput.fee};
  }

  /**
   * Serialize task input
   *
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
  version() {
    return '0.0.1';
  }
}
