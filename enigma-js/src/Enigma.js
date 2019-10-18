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
import JSBI from 'jsbi';
import retry from 'retry';
import * as abi from 'ethereumjs-abi';
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
  constructor(web3, enigmaContractAddr, tokenContractAddr, rpcAddr, txDefaults = {}, config = {}) {
    this.web3 = web3;
    this.txDefaults = txDefaults;

    this.config = {};
    this.config.retry = {};
    this.config.retry.retries = config.retry ?
      (config.retry.retries != null ? config.retry.retries : 5) : 5;
    this.config.retry.factor = config.retry ?
      (config.retry.factor != null ? config.retry.factor : 2) : 2;
    this.config.retry.minTimeout = config.retry ?
      (config.retry.minTimeout != null ? config.retry.minTimeout : 2000) : 2000;
    this.config.retry.maxTimeout = config.retry ?
      (config.retry.maxTimeout != null ? config.retry.maxTimeout : 'Infinity') : 'Infinity';
    this.config.retry.randomize = config.retry ?
      (config.retry.randomize != null ? config.retry.randomize : true) : true;

    // axios callback for jayson rpc client to interface with ENG network
    let callServer = function(request, callback) {
      let config = {
        headers: {
          'Content-Type': 'application/json',
          'credentials': 'include',
        },
      };
      axios.post(rpcAddr, JSON.parse(request), config).then((response) => {
        if (eeConstants.ERROR in response.data) {
          callback(response.data.error, null);
        } else {
          let text = JSON.stringify(response.data.result);
          callback(null, text);
        }
      }).catch(function(err) {
        callback({code: -32000, message: err.message}, null);
      });
    };
    this.client = jaysonBrowserClient(callServer, {});
    this.workerParamsCache = {};
    this.selectedWorkerGroupCache = {};
    this.taskKeyLocalStorage = {};
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
   * @param {string} enigmaContractAddr - Address the Enigma contract is deployed to on Ethereum
   * @param {string} tokenContractAddr - Address the Enigma token contract is deployed to on Ethereum
   */
  createContracts(enigmaContractAddr, tokenContractAddr) {
    this.enigmaContract = new this.web3.eth.Contract(EnigmaContract['abi'],
      enigmaContractAddr, this.txDefaults);
    this.tokenContract = new this.web3.eth.Contract(EnigmaTokenContract['abi'],
      tokenContractAddr, this.txDefaults);
  }

  /**
   * Create a base Task - a wrapper for a task (either contract deployments or compute tasks)
   *
   * @param {string} fn - Function name
   * @param {Array} args - Inputs for task in the form of [[arg1, '<type>'], ..., [argn, '<type>']]
   * @param {Number} gasLimit - ENG gas limit for task computation
   * @param {Number} gasPx - ENG gas price for task computation
   * @param {string} sender - ETH address for task sender
   * @param {string/Buffer} scAddrOrPreCode - Either secret contract address (string) or precode (Buffer), depending
   * on if user is running a contract deployment or compute task
   * @param {boolean} isContractDeploymentTask - Is this task a contract deployment task (if not, it's a compute task)
   * @returns {EventEmitter} EventEmitter to be listened to track creation of task. Emits a Task with base attributes
   * to be used for remainder of task lifecycle
   */
  createTask(fn, args, gasLimit, gasPx, sender, scAddrOrPreCode, isContractDeploymentTask) {
    let emitter = new EventEmitter();
    (async () => {
      // TODO: never larger that 53-bit?
      const nonce = parseInt(await this.enigmaContract.methods.getUserTaskDeployments(sender).call());
      const scAddr = isContractDeploymentTask ? utils.generateScAddr(sender, nonce) : scAddrOrPreCode;
      let preCode;
      let preCodeGzip;
      if (isContractDeploymentTask) {
        if (Buffer.isBuffer(scAddrOrPreCode)) {
          preCode = scAddrOrPreCode;
          // gzip the preCode
          preCodeGzip = await utils.gzip(preCode);
        } else {
          throw Error('PreCode expected to be a Buffer, instead got '+typeof scAddrOrPreCode);
        }
      } else {
        preCode = '';
        preCodeGzip = '';
      }

      const preCodeHash = isContractDeploymentTask ?
        this.web3.utils.soliditySha3({t: 'bytes', value: preCode.toString('hex')}) : '';
      const argsTranspose = (args === undefined || args.length === 0) ? [[], []] :
        args[0].map((col, i) => args.map((row) => row[i]));
      const abiEncodedArgs = utils.remove0x(this.web3.eth.abi.encodeParameters(argsTranspose[1], argsTranspose[0]));
      let abiEncodedArgsArray = [];
      for (let n = 0; n < abiEncodedArgs.length; n += 2) {
        abiEncodedArgsArray.push(parseInt(abiEncodedArgs.substr(n, 2), 16));
      }
      const blockNumber = await this.web3.eth.getBlockNumber();
      const workerParams = await this.getWorkerParams(blockNumber);
      const firstBlockNumber = workerParams.firstBlockNumber;
      let workerAddress = await this.selectWorkerGroup(scAddr, workerParams, 1)[0]; // TODO: tmp fix 1 worker
      workerAddress = workerAddress.toLowerCase().slice(-40); // remove leading '0x' if present
      const {publicKey, privateKey} = this.obtainTaskKeyPair();
      try {
        const getWorkerEncryptionKeyResult = await new Promise((resolve, reject) => {
          this.client.request('getWorkerEncryptionKey',
            {workerAddress: workerAddress, userPubKey: publicKey}, (err, response) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(response);
            });
        });
        const {result, id} = getWorkerEncryptionKeyResult;
        const {workerEncryptionKey, workerSig} = result;

        // The signature of the workerEncryptionKey is generated
        // concatenating the following elements in a bytearray:
        // len('Enigma User Message') + b'Enigma User Message' + len(workerEncryptionKey) + workerEncryptionKey
        // Because the first 3 elements are constant, they are hardcoded as follows:
        // len('Enigma User Message') as a uint64 => 19 in hex => 0000000000000013
        // bytes of 'Enigma User Message' in hex => 456e69676d612055736572204d657373616765
        // len(workerEncryptionKey) as a unit64 => 64 in hex => 0000000000000040
        const hexToVerify = '0x0000000000000013456e69676d612055736572204d6573736167650000000000000040' +
          workerEncryptionKey;

        // the hashing function soliditySha3 expects hex instead of bytes
        let recAddress = EthCrypto.recover('0x'+workerSig,
          this.web3.utils.soliditySha3({t: 'bytes', value: hexToVerify}));

        recAddress = recAddress.toLowerCase().slice(-40); // remove leading '0x' if present

        if (workerAddress !== recAddress) {
          console.error('Worker address', workerAddress, '!= recovered address', recAddress);
          emitter.emit(eeConstants.ERROR, {
            name: 'InvalidWorker',
            message: `Invalid worker encryption key + signature combo ${workerAddress} != ${recAddress}`,
          });
        } else {
          // Generate derived key from worker's encryption key and user's private key
          const derivedKey = utils.getDerivedKey(workerEncryptionKey, privateKey);
          // Encrypt function and ABI-encoded args
          const encryptedFn = utils.encryptMessage(derivedKey, fn);
          const encryptedAbiEncodedArgs = utils.encryptMessage(derivedKey, Buffer.from(abiEncodedArgsArray));
          const msg = this.web3.utils.soliditySha3(
            {t: 'bytes', v: encryptedFn},
            {t: 'bytes', v: encryptedAbiEncodedArgs},
          );
          const userTaskSig = await this.web3.eth.sign(msg, sender);
          emitter.emit(eeConstants.CREATE_TASK, new Task(scAddr, encryptedFn, encryptedAbiEncodedArgs, gasLimit, gasPx,
            id, publicKey, firstBlockNumber, workerAddress, workerEncryptionKey, sender, userTaskSig, nonce,
            preCodeGzip.toString('base64'), preCodeHash, isContractDeploymentTask));
        }
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err);
      }
    })();
    return emitter;
  }

  /**
   * Create and store a task record on chain (ETH). Task records are necessary for collecting the ENG computation fee
   * and computing the immutable taskId (a unique value for each task computed from hash(user's ETH address, user's
   * nonce value monotonically increasing for every task deployment). Thus, task records have important implications for
   * task ordering, fee payments, and verification.
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @returns {EventEmitter} EventEmitter to be listened to track creation of task record. Emits a Task with task
   * record creation attributes to be used for remainder of task lifecycle
   */
  createTaskRecord(task) {
    let emitter = new EventEmitter();
    (async () => {
      const balance = await this.tokenContract.methods.balanceOf(task.sender).call();
      if (balance < (task.gasLimit * task.gasPx)) {
        emitter.emit(eeConstants.ERROR, {
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
            task.gasPx, task.firstBlockNumber, task.nonce).send({
            from: task.sender,
          }).on('transactionHash', (hash) => {
            task.transactionHash = hash;
            emitter.emit(eeConstants.CREATE_TASK_RECORD_TRANSACTION_HASH, hash);
          }).on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit(eeConstants.CREATE_TASK_RECORD_CONFIRMATION, confirmationNumber, receipt);
          })
          :
          await this.enigmaContract.methods.createTaskRecord(task.inputsHash, task.gasLimit, task.gasPx,
            task.firstBlockNumber).send({
            from: task.sender,
          }).on('transactionHash', (hash) => {
            task.transactionHash = hash;
            emitter.emit(eeConstants.CREATE_TASK_RECORD_TRANSACTION_HASH, hash);
          }).on('confirmation', (confirmationNumber, receipt) => {
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
   * Get the Task's task record status from Ethereum
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @return {Promise} Resolves to Task wrapper with updated ethStatus and proof properties
   */
  async getTaskRecordStatus(task) {
    const result = await this.enigmaContract.methods.getTaskRecord(task.taskId).call();
    task.ethStatus = parseInt(result.status);
    task.proof = result.proof;
    return task;
  }

  /**
   * Get the Task's task record status from Ethereum
   *
   * @param {string} taskId - Task ID
   * @return {Promise} Resolves to TaskRecord struct
   */
  async getTaskRecordFromTaskId(taskId) {
    const taskRecord = await this.enigmaContract.methods.getTaskRecord(taskId).call();
    return {
      sender: taskRecord.sender,
      inputsHash: taskRecord.inputsHash,
      outputHash: taskRecord.outputHash,
      gasLimit: parseInt(taskRecord.gasLimit),
      gasPx: parseInt(taskRecord.gasPx),
      blockNumber: parseInt(taskRecord.blockNumber),
      status: parseInt(taskRecord.status),
      proof: taskRecord.proof,
    };
  }

  /**
   * Fetch output hash for a given task
   *
   * @param {Task} task - Task wrapper
   * @return {Promise} - Resolves to output hash for the task
   */
  async getTaskOutputHash(task) {
    return (await this.enigmaContract.methods.getTaskRecord(task.taskId).call()).outputHash;
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
   * node), first block number for the epoch, list of active work addresses (ordered list of worker signing addresses
   * that were logged in at the start of the epoch), and list of active worker balances
   */
  async getWorkerParams(blockNumber) {
    if ((Object.keys(this.workerParamsCache).length === 0) ||
      (blockNumber - this.workerParamsCache.firstBlockNumber >= this.epochSize)) {
      this.epochSize = await this.enigmaContract.methods.getEpochSize().call();
      const getWorkerParamsResult = await this.enigmaContract.methods.getWorkerParams(blockNumber).call();
      this.workerParamsCache = {
        firstBlockNumber: parseInt(getWorkerParamsResult[0]),
        seed: JSBI.BigInt(getWorkerParamsResult[1]),
        workers: getWorkerParamsResult[2],
        stakes: getWorkerParamsResult[3].map((x) => JSBI.BigInt(x)),
      };
    }
    return this.workerParamsCache;
  }

  /**
   * Select the workers weighted-randomly based on the staked token amount that will run the computation task
   *
   * @param {string} scAddr - Secret contract address
   * @param {Object} params - Worker params (epoch first block number, seed, worker signing addresses, worker stakes)
   * @param {number} workerGroupSize - Number of workers to be selected for task
   * @return {Array} An array of selected workers where each selected worker is chosen with probability equal to
   * number of staked tokens
   */
  selectWorkerGroup(scAddr, params, workerGroupSize = 5) {
    // Find total number of staked tokens for workers
    let tokenCpt = params.stakes.reduce((a, b) => JSBI.add(a, b), JSBI.BigInt(0));
    let nonce = 0;
    let selectedWorkers = [];
    do {
      // Unique hash for epoch, secret contract address, and nonce
      const msg = abi.rawEncode(
        ['uint256', 'bytes32', 'uint256'],
        [params.seed.toString(10), scAddr, nonce],
      );
      const hash = web3Utils.keccak256(msg);
      // Find random number between [0, tokenCpt)
      let randVal = JSBI.remainder(JSBI.BigInt(hash), tokenCpt);
      let selectedWorker = params.workers[params.workers.length - 1];
      // Loop through each worker, subtracting worker's balance from the random number computed above. Once the
      // decrementing randVal becomes negative, add the worker whose balance caused this to the list of selected
      // workers. If worker has already been selected, increase nonce by one, resulting in a new hash computed above.
      for (let i = 0; i < params.workers.length; i++) {
        randVal = JSBI.subtract(randVal, params.stakes[i]);
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
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @return {EventEmitter} EventEmitter to be listened to track submission of Task to Enigma p2p network. Emits
   * a response from the ENG network indicating whether client is ready to track the remainder of the task lifecycle
   */
  sendTaskInput(task) {
    let emitter = new EventEmitter();
    (async () => {
      let rpcEndpointName = eeConstants.RPC_SEND_TASK_INPUT;
      let emitName = eeConstants.SEND_TASK_INPUT_RESULT;
      if (task.isContractDeploymentTask) {
        rpcEndpointName = eeConstants.RPC_DEPLOY_SECRET_CONTRACT;
        emitName = eeConstants.DEPLOY_SECRET_CONTRACT_RESULT;
      }
      try {
        await new Promise((resolve, reject) => {
          this.client.request(rpcEndpointName, Enigma.serializeTask(task), (err, response) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
        emitter.emit(emitName, task);
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err);
      }
    })();
    return emitter;
  }

  /**
   * Get task result from p2p network
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @return {EventEmitter} EventEmitter to be listened to track getting result from Enigma network. Emits
   * a response from the ENG network.
   */
  getTaskResult(task) {
    let emitter = new EventEmitter();

    let operation = retry.operation(this.config.retry);
    operation.attempt(async (currentAttempt)=>{
      try {
        const getTaskResultResult = await new Promise((resolve, reject) => {
          this.client.request(eeConstants.RPC_GET_TASK_RESULT,
            {taskId: utils.remove0x(task.taskId)}, (err, response) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
        });
        if (getTaskResultResult.result) {
          switch (getTaskResultResult.result.status) {
            case eeConstants.GET_TASK_RESULT_SUCCESS:
              task.delta = getTaskResultResult.result.delta;
              task.ethereumPayload = getTaskResultResult.result.ethereumPayload;
              task.ethereumAddress = getTaskResultResult.result.ethereumAddress;
              task.preCodeHash = getTaskResultResult.result.preCodeHash;
            case eeConstants.GET_TASK_RESULT_FAILED:
              task.encryptedAbiEncodedOutputs = getTaskResultResult.result.output;
              task.usedGas = getTaskResultResult.result.usedGas;
              task.workerTaskSig = getTaskResultResult.result.signature;
            case eeConstants.GET_TASK_RESULT_UNVERIFIED:
            case eeConstants.GET_TASK_RESULT_INPROGRESS:
              task.engStatus = getTaskResultResult.result.status;
              break;
            default:
              throw (new Error('Invalid task result status')).message;
          }
        } else {
          if (operation.retry(true)) {
            console.log('Warning: Got an empty TaskResult on attempt '+
              currentAttempt+' of '+(this.config.retry.retries + 1)+'. Retrying...');
            return;
          } else {
            task.engStatus = null;
          }
        }
        emitter.emit(eeConstants.GET_TASK_RESULT_RESULT, task);
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err);
      }
    });

    return emitter;
  }

  /**
   * Return fees for task
   *
   * @param {Task} task - Task wrapper
   * @returns {EventEmitter} EventEmitter to be listened to track return of fees
   */
  returnFeesForTask(task) {
    let emitter = new EventEmitter();
    (async () => {
      const taskTimeoutSize = await this.enigmaContract.methods.getTaskTimeoutSize().call();
      const blockNumber = await this.web3.eth.getBlockNumber();
      if (blockNumber - task.creationBlockNumber <= taskTimeoutSize) {
        emitter.emit(eeConstants.ERROR, {
          name: 'InvalidTaskReturn',
          message: 'Not enough time has elapsed to return task funds',
        });
        return;
      }
      try {
        const receipt = await this.enigmaContract.methods.returnFeesForTask(task.taskId).send({
          from: task.sender,
        });
        task.ethStatus = eeConstants.ETH_STATUS_FAILED_RETURN;
        emitter.emit(eeConstants.RETURN_FEES_FOR_TASK_RECEIPT, receipt);
        emitter.emit(eeConstants.RETURN_FEES_FOR_TASK, task);
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err.message);
      }
    })();
    return emitter;
  }

  /**
   * Decrypt task result
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @return {Task} Task result wrapper with an updated decrypted output attribute
   */
  async decryptTaskResult(task) {
    console.log('task.encryptedAbiEncodedOutputs is '+task.encryptedAbiEncodedOutputs);
    if (task.encryptedAbiEncodedOutputs) {
      const {privateKey} = this.obtainTaskKeyPair();
      const derivedKey = utils.getDerivedKey(task.workerEncryptionKey, privateKey);
      task.decryptedOutput = utils.decryptMessage(derivedKey, task.encryptedAbiEncodedOutputs);
    } else {
      console.log('Warning: task.encryptedAbiEncodedOutputs is empty, there is nothing to decrypt.');
      task.decryptedOutput = null;
    }
    return task;
  }

  /**
   * Verify ENG network output matches output registered on ETH
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @return {boolean} True/false on whether outputs match
   */
  async verifyTaskOutput(task) {
    const ethOutputHash = await this.getTaskOutputHash(task);
    const engOutputHash = this.web3.utils.soliditySha3(
      {t: 'bytes', value: task.encryptedAbiEncodedOutputs.toString('hex')}
    );
    return ethOutputHash === engOutputHash;
  }

  /**
   * Verify ENG network status matches status registered on ETH
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @return {boolean} True/false on whether statuses match
   */
  async verifyTaskStatus(task) {
    const ethStatus = (await this.getTaskRecordStatus(task)).ethStatus;
    switch (task.engStatus) {
      case eeConstants.GET_TASK_RESULT_SUCCESS:
        return ethStatus === eeConstants.ETH_STATUS_VERIFIED;
        break;
      case eeConstants.GET_TASK_RESULT_FAILED:
        return ethStatus === eeConstants.ETH_STATUS_FAILED;
        break;
      case eeConstants.GET_TASK_RESULT_UNVERIFIED:
      case eeConstants.GET_TASK_RESULT_INPROGRESS:
        return ethStatus === eeConstants.ETH_STATUS_CREATED;
        break;
      default:
        return ethStatus === eeConstants.ETH_STATUS_UNDEFINED;
    }
  }

  /**
   * Generator function for polling the Enigma p2p network for task status
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @param {boolean} withResult - Task wrapper for contract deployment and compute tasks
   */
  * pollTaskStatusGen(task, withResult) {
    while (true) {
      yield new Promise((resolve, reject) => {
        this.client.request(eeConstants.RPC_GET_TASK_STATUS, {
          taskId: utils.remove0x(task.taskId), workerAddress: task.workerAddress,
          withResult: withResult,
        }, (err, response) => {
          if (err) {
            reject(err);
            return;
          }
          task.engStatus = response.result.status;
          if (withResult) {
            task.encryptedAbiEncodedOutputs = response.result.output;
          }
          resolve(task);
        });
      });
    }
  }

  /**
   * Inner poll status function that continues to poll the Enigma p2p network until the task has been verified
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @param {pollTaskStatusGen} generator - Generator function for polling Enigma p2p network for task status
   * @param {EventEmitter} emitter - EventEmitter to track Enigma p2p network polling for Task status
   */
  innerPollTaskStatus(task, generator, emitter) {
    let p = generator.next();
    p.value.then((d) => {
      emitter.emit(eeConstants.POLL_TASK_STATUS_RESULT, d);
      if (d.engStatus !== 'SUCCESS' && d.engStatus !== 'FAILED') {
        this.innerPollTaskStatus(task, generator, emitter);
      }
    }).catch((err) => {
      emitter.emit(eeConstants.ERROR, err);
    });
  }

  /**
   * Poll the Enigma p2p network for a TaskInput's status
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @param {boolean} withResult - Task wrapper for contract deployment and compute tasks
   * @return {EventEmitter} EventEmitter to be listened to track polling the Enigma p2p network for a Task status.
   * Emits a Task with task result attributes
   */
  pollTaskStatus(task, withResult = false) {
    let emitter = new EventEmitter();
    let generator = this.pollTaskStatusGen(task, withResult);
    this.innerPollTaskStatus(task, generator, emitter);
    return emitter;
  }

  /**
   * Poll the ETH for a Task's status
   *
   * @param {Task} task - Task wrapper for contract deployment and compute tasks
   * @param {Number} interval - Polling interval in ms
   * @return {Task} Task wrapper with updated ETH status.
   */
  async pollTaskETH(task, interval=1000) {
    while (task.ethStatus === eeConstants.ETH_STATUS_CREATED) {
      task = await this.getTaskRecordStatus(task);
      await utils.sleep(interval);
    }
    return task;
  }

  /**
   * Serialize Task for submission to the Enigma p2p network depending on whether it is a deployment or compute task
   *
   * @param {Task} task - Task wrapper for contract deployment or compute task
   * @return {Object} Serialized Task for submission to the Enigma p2p network
   */
  static serializeTask(task) {
    return task.isContractDeploymentTask ? {
      preCode: task.preCode,
      encryptedArgs: utils.remove0x(task.encryptedAbiEncodedArgs), encryptedFn: utils.remove0x(task.encryptedFn),
      userDHKey: utils.remove0x(task.userPubKey), contractAddress: utils.remove0x(task.scAddr),
      workerAddress: task.workerAddress,
    } : {
      taskId: utils.remove0x(task.taskId), workerAddress: task.workerAddress,
      encryptedFn: utils.remove0x(task.encryptedFn), encryptedArgs: utils.remove0x(task.encryptedAbiEncodedArgs),
      contractAddress: utils.remove0x(task.scAddr), userDHKey: utils.remove0x(task.userPubKey),
    };
  }

  /**
   * Obtain task key pair that has been set
   *
   * @return {Object} Public key-private key pair
   */
  obtainTaskKeyPair() {
    // TODO: Developer tool to allow users to select their own unique passphrase to generate private key
    const isBrowser = typeof window !== 'undefined';
    let privateKey;
    let encodedPrivateKey = isBrowser ? window.localStorage.getItem('encodedPrivateKey') :
      this.taskKeyLocalStorage['encodedPrivateKey'];
    if (encodedPrivateKey == null) {
      throw Error('Need to set task key pair first');
    } else {
      privateKey = isBrowser ? atob(encodedPrivateKey) : Buffer.from(encodedPrivateKey, 'base64').toString('binary');
    }
    let publicKey = EthCrypto.publicKeyByPrivateKey(privateKey);
    return {publicKey, privateKey};
  }

  /**
   * Deterministically generate a key-secret pair necessary for deriving a shared encryption key with the selected
   * worker. This pair will be stored in local storage for quick retrieval.
   *
   * @param {string} seed - Optional seed
   * @return {string} Seed
   */
  setTaskKeyPair(seed='') {
    const isBrowser = typeof window !== 'undefined';
    if (seed === '') {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 9; i++) {
        seed += characters.charAt(Math.floor(Math.random() * characters.length));
      }
    }
    let random = forge.random.createInstance();
    // TODO: Query user for passphrase
    random.seedFileSync = function(needed) {
      return forge.util.fillString(seed, needed);
    };
    const privateKey = forge.util.bytesToHex(random.getBytes(32));
    isBrowser ? window.localStorage.setItem('encodedPrivateKey', btoa(privateKey)) :
      this.taskKeyLocalStorage['encodedPrivateKey'] = Buffer.from(privateKey, 'binary').toString('base64');
    return seed;
  }

  /**
   * Create a task to deploy a secret contract - creates base task, creates task record, and sends task to the
   * Enigma network. This is the most efficient and likely most common method for creating and deploying a secret
   * contract.
   *
   * @param {string} fn - Function name
   * @param {Array} args - Inputs for task in the form of [[arg1, '<type>'], ..., [argn, '<type>']]
   * @param {Number} gasLimit - ENG gas limit for task computation
   * @param {Number} gasPx - ENG gas price for task computation
   * @param {string} sender - ETH address for task sender
   * @param {string} preCode - Precode for contract deployment
   * @param {Number} maxRetries - Max number of retries if submitted around epoch change
   * @return {Task} Task with attributes necessary for task record and Enigma network
   */
  deploySecretContract(fn, args, gasLimit, gasPx, sender, preCode, maxRetries=1) {
    let emitter = new EventEmitter();
    (async () => {
      let retryCount = 0;
      while (true) {
        try {
          let scTask = await new Promise((resolve, reject) => {
            this.createTask(fn, args, gasLimit, gasPx, sender, preCode, true).
            on(eeConstants.CREATE_TASK, (result) => resolve(result)).
            on(eeConstants.ERROR, (error) => reject(error));
          });
          emitter.emit(eeConstants.CREATE_TASK, scTask);
          scTask = await new Promise((resolve, reject) => {
            this.createTaskRecord(scTask).
            on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result)).
            on(eeConstants.ERROR, (error) => reject(error));
          });
          emitter.emit(eeConstants.CREATE_TASK_RECORD, scTask);
          await new Promise((resolve, reject) => {
            this.sendTaskInput(scTask).
            on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
            on(eeConstants.ERROR, (error) => reject(error));
          });
          emitter.emit(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, scTask);
          break;
        } catch (err) {
          if ((retryCount++ >= maxRetries) ||
            (err !== 'Returned error: VM Exception while processing transaction: revert Wrong epoch for this task')) {
            emitter.emit(eeConstants.ERROR, err);
            break;
          }
        }
      }
    })();
    return emitter;
  }

  /**
   * Create a compute task - creates base task, creates task record, and sends task to the Enigma network. This is the
   * most efficient and likely most common method for creating and sending a compute task.
   *
   * @param {string} fn - Function name
   * @param {Array} args - Inputs for task in the form of [[arg1, '<type>'], ..., [argn, '<type>']]
   * @param {Number} gasLimit - ENG gas limit for task computation
   * @param {Number} gasPx - ENG gas price for task computation
   * @param {string} sender - ETH address for task sender
   * @param {string} scAddr - Secret contract address
   * @param {Number} maxRetries - Max number of retries if submitted around epoch change
   * @return {Task} Task with attributes necessary for task record and Enigma network
   */
  computeTask(fn, args, gasLimit, gasPx, sender, scAddr, maxRetries=1) {
    let emitter = new EventEmitter();
    (async () => {
      let retryCount = 0;
      while (true) {
        try {
          let task = await new Promise((resolve, reject) => {
            this.createTask(fn, args, gasLimit, gasPx, sender, scAddr, false).
            on(eeConstants.CREATE_TASK, (result) => resolve(result)).
            on(eeConstants.ERROR, (error) => reject(error));
          });
          emitter.emit(eeConstants.CREATE_TASK, task);
          task = await new Promise((resolve, reject) => {
            this.createTaskRecord(task).
            on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result)).
            on(eeConstants.ERROR, (error) => reject(error));
          });
          emitter.emit(eeConstants.CREATE_TASK_RECORD, task);
          await new Promise((resolve, reject) => {
            this.sendTaskInput(task).
            on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt)).
            on(eeConstants.ERROR, (error) => reject(error));
          });
          emitter.emit(eeConstants.SEND_TASK_INPUT_RESULT, task);
          break;
        } catch (err) {
          if ((retryCount++ >= maxRetries) ||
            (err !== 'Returned error: VM Exception while processing transaction: revert Wrong epoch for this task')) {
            emitter.emit(eeConstants.ERROR, err);
            break;
          }
        }
      }
    })();
    return emitter;
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
