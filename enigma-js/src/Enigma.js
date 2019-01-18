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
          } else {
            let text = JSON.stringify(response.data.result);
            callback(null, text);
          }
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
   * Create a base Task - a wrapper for a task (either contract deployments or regular tasks)
   *
   * @param {string} fn - Function name
   * @param {Array} args - Inputs for task in the form of [[arg1, '<type>'], ..., [argn, '<type>']]. For a secret
   * contract deployment task, the first entry pair in the args list will be [preCodeHash, 'bytes32'] followed by
   * the constructor args
   *
   * @param {Number} gasLimit - ENG gas limit for task computation
   * @param {Number} gasPx - ENG gas price for task computation
   * @param {string} sender - ETH address for task sender
   * @param {string} scAddrOrPreCodeHash - Either secret contract address or precode hash, depending on if user is
   * running a contract deployment or regular task
   * @param {boolean} isContractDeploymentTask - Is this task a contract deployment task (if not, it's a regular task)
   * @return {Task} Task with base attributes to be used for remainder of task lifecycle
   */
  createTask(fn, args, gasLimit, gasPx, sender, scAddrOrPreCodeHash, isContractDeploymentTask=false) {
    let emitter = new EventEmitter();
    (async () => {
      const nonce = parseInt(await this.enigmaContract.methods.userTaskDeployments(sender).call());
      const scAddr = isContractDeploymentTask ? utils.generateScAddr(sender, nonce) : scAddrOrPreCodeHash;
      const preCodeHash = isContractDeploymentTask ? scAddrOrPreCodeHash : '';
      const argsTranspose = args[0].map((col, i) => args.map((row) => row[i]));
      const abiEncodedArgs = this.web3.eth.abi.encodeParameters(argsTranspose[1], argsTranspose[0]);
      const blockNumber = await this.web3.eth.getBlockNumber();
      const workerParams = await this.getWorkerParams(blockNumber);
      const workerAddress = await this.selectWorkerGroup(blockNumber, scAddr, workerParams, 5)[0];
      try {
        const getWorkerEncryptionKeyResult = await new Promise((resolve, reject) => {
          this.client.request('getWorkerEncryptionKey', {workerAddress}, (err, response) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
        const {workerEncryptionKey, workerSig, msgId} = getWorkerEncryptionKeyResult;
        if (workerEncryptionKey !== utils.recoverPublicKey(workerSig,
          this.web3.utils.soliditySha3({t: 'bytes', v: workerEncryptionKey}))) {
          emitter.emit(eeConstants.ERROR, {
            name: 'InvalidWorker',
            message: 'Invalid worker encryption key + signature combo',
          });
        } else {
          const {publicKey, privateKey} = this.obtainTaskKeyPair();
          // Generate derived key from worker's encryption key and user's private key
          const derivedKey = utils.getDerivedKey(workerEncryptionKey, privateKey);
          // Encrypt function and ABI-encoded args
          const encryptedFn = utils.encryptMessage(derivedKey, fn);
          const encryptedAbiEncodedArgs = utils.encryptMessage(derivedKey, abiEncodedArgs);
          const msg = this.web3.utils.soliditySha3(
            {t: 'bytes', v: encryptedFn},
            {t: 'bytes', v: encryptedAbiEncodedArgs},
          );
          const userTaskSig = await this.web3.eth.sign(msg, sender);
          emitter.emit(eeConstants.CREATE_TASK, new Task(scAddr, encryptedFn, encryptedAbiEncodedArgs, gasLimit, gasPx,
            msgId, publicKey, workerAddress, sender, userTaskSig, nonce, preCodeHash, isContractDeploymentTask));
        }
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err);
      }
    })();
    return emitter;
  }

  /**
   * Create and store a task record on chain (ETH). Task records are necessary for collecting the ENG computation fee
   * and computing the immutable taskId (a unique value for each task computed from hash(hash(encrypted function
   * signature, encrypted ABI-encoded arguments, gas limit, gas price, user's public key), user's nonce value
   * monotonically increasing for every task deployment). Thus, task records have important implications for task
   * ordering, fee payments, and verification.
   *
   * @param {Task} task - Task wrapper for contract deployment and regular tasks
   * @returns {EventEmitter} EventEmitter to be listened to track creation of task record. Emits a Task with task
   * record creation attributes to be used for remainder of task lifecycle
   */
  createTaskRecord(task) {
    let emitter = new EventEmitter();
    (async () => {
      const balance = await this.tokenContract.methods.balanceOf(task.sender).call();
      if (balance < (task.gasLimit * task.gasPx)) {
        emitter.emit('error', {
          name: 'NotEnoughTokens',
          message: 'Not enough tokens to pay the fee',
        });
        return;
      }
      await this.tokenContract.methods.approve(this.enigmaContract.options.address, task.gasLimit * task.gasPx).send({
        from: task.sender,
      });
      try {
        const receipt = task.isContractDeploymentTask ?
          await this.enigmaContract.methods.createDeploymentTaskRecord(task.inputsHash, task.gasLimit,
            task.gasPx, task.workerAddress, task.scAddr, task.nonce).send({
            from: task.sender,
          })
            .on('transactionHash', (hash) => {
              task.transactionHash = hash;
              emitter.emit(eeConstants.CREATE_TASK_RECORD_TRANSACTION_HASH, hash);
            })
            .on('confirmation', (confirmationNumber, receipt) => {
              emitter.emit(eeConstants.CREATE_TASK_RECORD_CONFIRMATION, confirmationNumber, receipt);
            })
          :
          await this.enigmaContract.methods.createTaskRecord(task.inputsHash, task.gasLimit, task.gasPx,
            task.workerAddress, task.scAddr).send({
            from: task.sender,
          })
            .on('transactionHash', (hash) => {
              task.transactionHash = hash;
              emitter.emit(eeConstants.CREATE_TASK_RECORD_TRANSACTION_HASH, hash);
            })
            .on('confirmation', (confirmationNumber, receipt) => {
              emitter.emit(eeConstants.CREATE_TASK_RECORD_CONFIRMATION, confirmationNumber, receipt);
            });
        task.taskId = receipt.events.TaskRecordCreated.returnValues.taskId;
        task.receipt = receipt;
        task.ethStatus = 1;
        task.creationBlockNumber = receipt.blockNumber;
        emitter.emit(eeConstants.CREATE_TASK_RECORD_RECEIPT, receipt);
        emitter.emit(eeConstants.CREATE_TASK_RECORD, task);
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err.message);
      }
    })();
    return emitter;
  }

  /**
   * Create and store task records on chain (ETH). Task records are necessary for collecting the ENG computation fee
   * and computing the immutable taskId (a unique value for each task computed from hash(hash(encrypted function
   * signature, encrypted ABI-encoded arguments, gas limit, gas price, user's public key), user's nonce value
   * monotonically increasing for every task deployment). Thus, task records have important implications for task
   * ordering, fee payments, and verification.
   *
   * @param {Array} tasks - Task wrappers for contract deployment and regular tasks
   * @returns {EventEmitter} EventEmitter to be listened to track creation of task records. Emits Tasks with task
   * record creation attributes to be used for remainder of task lifecycle
   */
  createTaskRecords(tasks) {
    let emitter = new EventEmitter();
    (async () => {
      const inputsHashes = tasks.map((task) => task.inputsHash);
      const gasLimits = tasks.map((task) => task.gasLimit);
      const gasPxs = tasks.map((task) => task.gasPx);
      const fees = tasks.map((task) => task.gasLimit * task.gasPx);
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
      await this.enigmaContract.methods.createTaskRecords(inputsHashes, gasLimits, gasPxs, tasks[0].workerAddress,
        tasks[0].scAddr).send({
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
   * @param {Task} task - Task wrapper for contract deployment and regular tasks
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
   *
   * @param {string} custodian - Worker's address
   * @return {Promise} Resolves to SGX report for the worker
   */
  async getReport(custodian) {
    return await this.enigmaContract.methods.getReport(custodian).call();
  }

  /**
   * Given a block number, obtain the worker parameters. These parameters remain the same for a given secret
   * contract and epoch (fixed number of blocks). These parameters are cached until the epoch changes.
   *
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
   *
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
   * Send Task to Enigma p2p network for computation
   *
   * @param {Task} task - Task wrapper for contract deployment and regular tasks
   * @return {EventEmitter} EventEmitter to be listened to track submission of Task to Enigma p2p network. Emits
   * a response from the ENG network indicating whether client is ready to track the remainder of the task lifecycle
   */
  sendTaskInput(task) {
    let emitter = new EventEmitter();
    (async () => {
      let rpcEndpointName = 'sendTaskInput';
      let emitName = eeConstants.SEND_TASK_INPUT_RESULT;
      if (task.isContractDeploymentTask) {
        rpcEndpointName = 'deploySecretContract';
        emitName = eeConstants.DEPLOY_SECRET_CONTRACT_RESULT;
      }
      try {
        const sendTaskInputResult = await new Promise((resolve, reject) => {
          this.client.request(rpcEndpointName, Enigma.serializeTask(task), (err, response) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
        emitter.emit(emitName, sendTaskInputResult);
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err);
      }
    })();
    return emitter;
  }

  /**
   * Generator function for polling the Enigma p2p network for task status
   *
   * @param {Task} task - Task wrapper for contract deployment and regular tasks
   */
  * pollTaskInputGen(task) {
    while (true) {
      yield new Promise((resolve, reject) => {
        this.client.request('pollTaskInput', {taskId: task.taskId}, (err, response) => {
          if (err) {
            reject(err);
            return;
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
   * @param {Task} task - Task wrapper for contract deployment and regular tasks
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
    }).catch((err) => {
      emitter.emit(eeConstants.ERROR, err);
    });
  }

  /**
   * Poll the Enigma p2p network for a TaskInput's status
   *
   * @param {Task} task - Task wrapper for contract deployment and regular tasks
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
   * @param {Task} task - Task wrapper for contract deployment and regular tasks
   * @return {Object} Serialized Task for submission to the Enigma p2p network
   */
  static serializeTask(task) {
    return task.isContractDeploymentTask ? {preCode: task.preCodeHash, encryptedArgs: task.encryptedAbiEncodedArgs,
      encryptedFn: task.encryptedFn, userDHKey: task.userPubKey, contractAddress: task.scAddr} : {taskId: task.taskId,
      workerAddress: task.workerAddress, encryptedFn: task.encryptedFn, encryptedArgs: task.encryptedAbiEncodedArgs,
      contractAddress: task.scAddr, userDHKey: task.userPubKey};
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
