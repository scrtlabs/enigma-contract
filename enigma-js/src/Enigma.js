/* eslint-disable prefer-spread,prefer-rest-params,valid-jsdoc */
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import Admin from './Admin';
import Task from './models/Task';
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
    // axios callback for jayson rpc client to interface with ENG network
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
            callback(response.data.error, null);
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
   * Create a base Task - a local wrapper for a task (either contract deployments or regular tasks) with some
   * preliminary attributes
   *
   * @param {string} fn - Function name
   * @param {Array} args - Inputs for task in the form of [[arg1, '<type>'], ..., [argn, '<type>']]. For a secret
   * contract deployment task, the first entry pair in the args list will be [preCodeHash, 'bytes32'] followed by
   * the constructor args
   * @param {Number} fee - ENG fee for task computation
   * @param {string} sender - ETH address for task sender
   * @param {string} scAddr - Defaults to empty string for the case of a secret contract deployment. For all other
   * tasks, this will be the secret contract address for which this task belongs
   * @return {Task} Task with base attributes to be used for remainder of task lifecycle: task record
   * (to be saved on ETH) -> task input (to be sent to the ENG network) -> task result (result and status obtained
   * from ENG network)
   */
  createTask(fn, args, fee, sender, scAddr='') {
    const {publicKey} = this.obtainTaskKeyPair();
    let argsTranspose = args[0].map((col, i) => args.map((row) => row[i]));
    let abiEncodedArgs = this.web3.eth.abi.encodeParameters(argsTranspose[1], argsTranspose[0]);
    let taskIdInputHash = utils.generateTaskIdInputHash(fn, abiEncodedArgs, publicKey);
    return new Task(taskIdInputHash, fn, abiEncodedArgs, fee, publicKey, sender, scAddr);
  }

  /**
   * Create and store a task record on chain (ETH). Task records are necessary for collecting the ENG computation fee
   * and computing the immutable taskId (a unique value for each task computed from hash(hash(function signature,
   * ABI-encoded arguments, user's public key), user's nonce value monotonically increasing for every task deployment).
   * Thus, task records have important implications for task ordering, fee payments, and verification.
   *
   * @param {Task} task - Task wrapper (with base attributes) for contract deployment and regular tasks
   * @returns {EventEmitter} EventEmitter to be listened to track creation of task record. Emits a Task with task
   * record creation attributes to be used for remainder of task lifecycle: task input (to be sent to the ENG network)
   * -> task result (result and status obtained from ENG network)
   */
  createTaskRecord(task) {
    let emitter = new EventEmitter();
    (async () => {
      const balance = await this.tokenContract.methods.balanceOf(task.sender).call();
      if (balance < task.fee) {
        emitter.emit('error', {
          name: 'NotEnoughTokens',
          message: 'Not enough tokens to pay the fee',
        });
        return;
      }
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, task.fee).send({
        from: task.sender,
      });
      await this.enigmaContract.methods.createTaskRecord(task.taskIdInputHash, task.fee).send({
        from: task.sender,
      })
        .on('transactionHash', (hash) => {
          task.transactionHash = hash;
          emitter.emit(eeConstants.CREATE_TASK_RECORD_TRANSACTION_HASH, hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit(eeConstants.CREATE_TASK_RECORD_CONFIRMATION, confirmationNumber, receipt);
        })
        .then((receipt) => {
          task.taskId = receipt.events.TaskRecordCreated.returnValues.taskId;
          task.receipt = receipt;
          task.ethStatus = 1;
          task.creationBlockNumber = receipt.blockNumber;
          emitter.emit(eeConstants.CREATE_TASK_RECORD_RECEIPT, receipt);
          emitter.emit(eeConstants.CREATE_TASK_RECORD, task);
        });
    })();
    return emitter;
  }

  /**
   * Create and store task records on chain (ETH). Task records are necessary for collecting the ENG computation fee
   * and computing the immutable taskId (a unique value for each task computed from hash(hash(function signature,
   * ABI-encoded arguments, user's public key), user's nonce value monotonically increasing for every task deployment).
   * Thus, task records have important implications for task ordering, fee payments, and verification.
   *
   * @param {Array} tasks - Task wrappers (with base attributes) for contract deployment and regular tasks
   * @returns {EventEmitter} EventEmitter to be listened to track creation of task record. Emits Tasks with task
   * record creation attributes to be used for remainder of tasks' lifecycles: task input (to be sent to the ENG
   * network) -> task result (result and status obtained from ENG network)
   */
  createTaskRecords(tasks) {
    let emitter = new EventEmitter();
    (async () => {
      const taskIdInputHashes = tasks.map((task) => task.taskIdInputHash);
      const fees = tasks.map((task) => task.fee);
      const balance = await this.tokenContract.methods.balanceOf(tasks[0].sender).call();
      const totalFees = fees.reduce((a, b) => a + b, 0);
      if (balance < totalFees) {
        emitter.emit('error', {
          name: 'NotEnoughTokens',
          message: 'Not enough tokens to pay the fee',
        });
        return;
      }
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, totalFees).send({
        from: tasks[0].sender,
      });
      await this.enigmaContract.methods.createTaskRecords(taskIdInputHashes, fees).send({
        from: tasks[0].sender,
      })
        .on('transactionHash', (hash) => {
          for (let i = 0; i < tasks.length; i++) {
            tasks[i].transactionHash = hash;
          }
          emitter.emit(eeConstants.CREATE_TASK_RECORDS_TRANSACTION_HASH, hash);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          emitter.emit(eeConstants.CREATE_TASK_RECORDS_CONFIRMATION, confirmationNumber, receipt);
        })
        .then((receipt) => {
          const taskIds = receipt.events.TaskRecordsCreated.returnValues.taskIds;
          for (let i = 0; i < tasks.length; i++) {
            tasks[i].taskId = taskIds[i];
            tasks[i].receipt = receipt;
            tasks[i].ethStatus = 1;
            tasks[i].creationBlockNumber = receipt.blockNumber;
          }
          emitter.emit(eeConstants.CREATE_TASK_RECORDS_RECEIPT, receipt);
          emitter.emit(eeConstants.CREATE_TASK_RECORDS, tasks);
        });
    })();
    return emitter;
  }

  /**
   * Get the Task's task record status from Ethereum
   *
   * @param {Task} task - Task wrapper (with task record attributes) for contract deployment and regular tasks
   * @return {Promise} Resolves to Task wrapper with updated ethStatus and proof properties
   */
  async getTaskRecordStatus(task) {
    const result = await this.enigmaContract.methods.tasks(task.taskId).call();
    task.ethStatus = parseInt(result.status);
    task.proof = result.proof;
    return task;
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
   * Given a block number, obtain the worker parameters. These parameters remain the same for a given secret
   * contract and epoch (fixed number of blocks). These parameters are cached until the epoch changes.
   * @param {int} blockNumber - Block number of task record's mining
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
   * @param {number} blockNumber - Block number of task record's mining
   * @param {string} scAddr - Secret contract address
   * @param {Object} params - Worker params
   * @param {number} workerGroupSize - Number of workers to be selected for task
   * @return {Array} An array of selected workers where each selected worker is chosen with probability equal to
   * number of staked tokens
   */
  selectWorkerGroup(blockNumber, scAddr, params, workerGroupSize = 5) {
    // Find total number of staked tokens for workers
    let tokenCpt = params.balances.reduce((a, b) => a + b, 0);
    let nonce = 0;
    let selectedWorkers = [];
    do {
      // Unique hash for epoch, secret contract address, and nonce
      const hash = web3Utils.soliditySha3(
        {t: 'uint256', v: params.seed},
        {t: 'bytes32', v: scAddr},
        {t: 'uint256', v: nonce},
      );
      // Find random number between [0, tokenCpt)
      let randVal = (web3Utils.toBN(hash).mod(web3Utils.toBN(tokenCpt))).toNumber();
      let selectedWorker = params.workers[params.workers.length - 1];
      // Loop through each worker, subtracting worker's balance from the random number computed above. Once the
      // decrementing randVal becomes negative, add the worker whose balance caused this to the list of selected
      // workers. If worker has already been selected, increase nonce by one, resulting in a new hash computed above.
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
   * Prepare a Task for submission to the ENG network. Most importantly, the function name and ABI-encoded args are
   * encrypted by using a derived key from the user's private key and selected worker's public key.
   * @param {Task} task - Task wrapper (with task record attributes) for contract deployment and regular tasks
   * @returns {EventEmitter} EventEmitter to be listened to track preparation of task input for ENG network. Emits
   * Task with task input attributes to be used for remainder of task lifecycle: sending task input to ENG network
   * -> task result (result and status obtained from ENG network)
   */
  createTaskInput(task) {
    let emitter = new EventEmitter();
    (async () => {
      // Set secret contract address to task's secret contract address or the taskId if scAddr has not been set (as is
      // the case for a contract deployment task)
      const scAddr = task.scAddr || task.taskId;
      const workerParams = await this.getWorkerParams(task.creationBlockNumber);
      // Select worker based on the task's epoch and secret contract address
      const workerAddress = await this.selectWorkerGroup(task.creationBlockNumber, scAddr, workerParams, 5)[0];
      // Request worker's encryption key from Enigma network
      const getWorkerEncryptionKeyResult = await new Promise((resolve, reject) => {
        this.client.request('getWorkerEncryptionKey', {workerAddress}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      });
      const {workerEncryptionKey, workerSig, msgId} = getWorkerEncryptionKeyResult;
      task.msgId = msgId;
      if (workerEncryptionKey !== utils.recoverPublicKey(workerSig,
        this.web3.utils.soliditySha3({t: 'bytes', v: workerEncryptionKey}))) {
        emitter.emit(eeConstants.ERROR, {
          name: 'InvalidWorker',
          message: 'Invalid worker encryption key + signature combo',
        });
      } else {
        const {privateKey} = this.obtainTaskKeyPair();
        // Generate derived key from worker's encryption key and user's private key
        const derivedKey = utils.getDerivedKey(workerEncryptionKey, privateKey);
        // Encrypt function and ABI-encoded args
        task.encryptedFn = utils.encryptMessage(derivedKey, task.fn);
        task.encryptedAbiEncodedArgs = utils.encryptMessage(derivedKey, task.abiEncodedArgs);
        const msg = this.web3.utils.soliditySha3(
          {t: 'bytes', v: task.encryptedFn},
          {t: 'bytes', v: task.encryptedAbiEncodedArgs},
        );
        task.userTaskSig = await this.web3.eth.sign(msg, task.sender);
        emitter.emit(eeConstants.CREATE_TASK_INPUT, task);
      }
    })();
    return emitter;
  }

  /**
   * Send Task to Enigma p2p network for computation
   *
   * @param {Task} task - Task wrapper (with task input attributes) for contract deployment and regular tasks
   * @return {EventEmitter} EventEmitter to be listened to track submission of TaskInput to Enigma p2p network. Emits
   * a response from the ENG network indicating whether client is ready to track the remainder of the task lifecycle:
   * task result (result and status obtained from ENG network)
   */
  sendTaskInput(task) {
    let emitter = new EventEmitter();
    (async () => {
      const sendTaskInputResult = await new Promise((resolve, reject) => {
        this.client.request('sendTaskInput', Enigma.serializeTask(task), (err, response) => {
          if (err) {
            emitter.emit(eeConstants.ERROR, err);
          } else {
            resolve(response);
          }
        });
      });
      emitter.emit(eeConstants.SEND_TASK_INPUT_RESULT, sendTaskInputResult);
    })();
    return emitter;
  }

  /**
   * Generator function for polling the Enigma p2p network for task status
   *
   * @param {Task} task - Task wrapper (with task input attributes) for contract deployment and regular tasks
   */
  * pollTaskInputGen(task) {
    while (true) {
      yield new Promise((resolve, reject) => {
        this.client.request('pollTaskInput', {taskId: task.taskId}, (err, response) => {
          if (err) {
            reject(err);
          }
          task.encryptedAbiEncodedOutputs = response.encryptedAbiEncodedOutputs;
          task.workerTaskSig = response.workerTaskSig;
          task.engStatus = response.engStatus;
          resolve(task);
        });
      });
    }
  }

  /**
   * Inner poll status function that continues to poll the Enigma p2p network until the task has been verified
   *
   * @param {Task} task - Task wrapper (with task input attributes) for contract deployment and regular tasks
   * @param {pollTaskGen} generator - Generator function for polling Enigma p2p network for task status
   * @param {EventEmitter} emitter - EventEmitter to track Enigma p2p network polling for Task status
   */
  innerPollTaskInput(task, generator, emitter) {
    let p = generator.next();
    p.value.then((d) => {
      emitter.emit(eeConstants.POLL_TASK_INPUT_RESULT, d);
      if (d.status !== 2) {
        this.innerPollTaskInput(task, generator, emitter);
      }
    });
  }

  /**
   * Poll the Enigma p2p network for a TaskInput's status
   *
   * @param {Task} task - Task wrapper (with task input attributes) for contract deployment and regular tasks
   * @return {EventEmitter} EventEmitter to be listened to track polling the Enigma p2p network for a Task status.
   * Emits a Task with task result attributes
   */
  pollTaskInput(task) {
    let emitter = new EventEmitter();
    let generator = this.pollTaskInputGen(task);
    this.innerPollTaskInput(task, generator, emitter);
    return emitter;
  }

  /**
   * Serialize Task for submission to the Enigma p2p network
   *
   * @param {Task} task - Task wrapper (with task input attributes) for contract deployment and regular tasks
   * @return {Object} Serialized Task for submission to the Enigma p2p network
   */
  static serializeTask(task) {
    return {taskId: task.taskId, creationBlockNumber: task.creationBlockNumber, sender: task.sender,
      scAddr: task.scAddr, encryptedFn: task.encryptedFn,
      encryptedAbiEncodedArgs: task.encryptedAbiEncodedArgs, userTaskSig: task.userTaskSig,
      userPubKey: task.userPubKey, fee: task.fee, msgId: task.msgId};
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
