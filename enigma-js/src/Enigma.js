/* eslint-disable prefer-spread,prefer-rest-params,valid-jsdoc */
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import Admin from './Admin';
import TaskRecord from './models/TaskRecord';
// import TaskReceipt from './models/TaskReceipt';
// import TaskResult from './models/TaskResult';
import TaskInput from './models/TaskInput';
import EventEmitter from 'eventemitter3';
import web3Utils from 'web3-utils';
import jaysonBrowserClient from 'jayson/lib/client/browser';
import axios from 'axios';
import utils from 'enigma-utils';

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
   * Store a task record on chain
   *
   * @param {Object} taskInput
   */
  createTaskRecord(taskInput) {
    console.log('creating task record', taskInput.taskId, taskInput.fee);
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
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, taskInput.fee).send(this.txDefaults)
        .on('transactionHash', (hash) => {
          emitter.emit('approveTransactionHash', hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit('approveConfirmation', confirmationNumber, receipt);
        })
        .on('receipt', (receipt) => {
          emitter.emit('approveReceipt', receipt);
        });
      await this.enigmaContract.methods.createTaskRecord(taskInput.taskId, taskInput.fee).send(this.txDefaults)
        .on('transactionHash', (hash) => {
          taskRecord.transactionHash = hash;
          emitter.emit('taskRecordTransactionHash', hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit('taskRecordConfirmation', confirmationNumber, receipt);
        })
        .on('receipt', (receipt) => {
          taskRecord.receipt = receipt;
          taskRecord.status = 1;
          emitter.emit('taskRecordReceipt', taskRecord);
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
        emitter.emit('error', {
          name: 'NotEnoughTokens',
          message: 'Not enough tokens to pay the fee',
        });
        return;
      }
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, totalFees).send(this.txDefaults)
        .on('transactionHash', (hash) => {
          emitter.emit('approveTransactionHash', hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit('approveConfirmation', confirmationNumber, receipt);
        })
        .on('receipt', (receipt) => {
          emitter.emit('approveReceipt', receipt);
        });
      await this.enigmaContract.methods.createTaskRecords(taskIds, fees).send(this.txDefaults)
        .on('transactionHash', (hash) => {
          for (let i = 0; i < taskRecords.length; i++) {
            taskRecords[i].transactionHash = hash;
          }
          emitter.emit('taskRecordsTransactionHash', hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit('taskRecordsConfirmation', confirmationNumber, receipt);
        })
        .on('receipt', (receipt) => {
          for (let i = 0; i < taskRecords.length; i++) {
            taskRecords[i].receipt = receipt;
            taskRecords[i].status = 1;
          }
          emitter.emit('taskRecordsReceipt', taskRecords);
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
    console.log('the task', result);
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
      console.log('updating worker params cache');
    }
    console.log('worker params', this.workerParamsCache);
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
   * @param {string} owner
   * @param {string} userPubKey
   * @param {Number} fee
   */
  createTaskInput(fn, args, scAddr, owner, userPubKey, fee) {
    let emitter = new EventEmitter();
    (async () => {
      const creationBlockNumber = await this.web3.eth.getBlockNumber();
      let taskInput = new TaskInput(creationBlockNumber, owner, scAddr, fn, args, userPubKey, fee);
      const workerParams = await this.getWorkerParams(creationBlockNumber);
      const workerAddress = await this.selectWorkerGroup(creationBlockNumber, scAddr, workerParams, 5)[0];
      console.log('1. Selected worker:', workerAddress);
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
      console.log('2. Got worker encryption key:', workerEncryptionKey, 'worker sig', workerSig);
      // TODO: generate client key pair
      const clientPrivateKey = '853ee410aa4e7840ca8948b8a2f67e9a1c2f4988ff5f4ec7794edf57be421ae5';
      const derivedKey = utils.getDerivedKey(workerEncryptionKey, clientPrivateKey);
      const encodedArgs = utils.encodeArguments(args);
      taskInput.encryptedFn = utils.encryptMessage(derivedKey, fn);
      taskInput.encryptedEncodedArgs = utils.encryptMessage(derivedKey, encodedArgs);
      const msg = this.web3.utils.soliditySha3(
        {t: 'bytes', v: taskInput.encryptedFn},
        {t: 'bytes', v: taskInput.encryptedEncodedArgs},
      );
      const userTaskSig = utils.sign(clientPrivateKey, msg);
      console.log('3. Got signature:', userTaskSig);
      taskInput.userTaskSig = userTaskSig;
      emitter.emit('createTaskInputReceipt', taskInput);
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
      emitter.emit('sendTaskInputReceipt', sendTaskInputResult);
    })();
    return emitter;
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
   * Return the version number of the library
   *
   * @return {string}
   */
  version() {
    return '0.0.1';
  }
}
