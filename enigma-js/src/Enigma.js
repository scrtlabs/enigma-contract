/* eslint-disable prefer-spread,prefer-rest-params,valid-jsdoc */
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import Admin from './Admin';
import TaskRecord from './models/TaskRecord';
// import TaskReceipt from './models/TaskReceipt';
import TaskResult from './models/TaskResult';
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
          callback(err);
        });
    };
    this.client = jaysonBrowserClient(callServer, {});
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
   * @param {string} taskId
   * @param {number} fee
   * @param {string} token
   * @param {number} tokenValue
   */
  createTaskRecord(taskId, fee, token = this.tokenContract.options.address, tokenValue = 0) {
    console.log('creating task record', taskId, fee);
    // TODO: approve the fee
    let emitter = new EventEmitter();
    this.tokenContract.methods.balanceOf(this.txDefaults.from).call()
      .then((balance) => {
        if (balance < fee) {
          emitter.emit('error', {
            name: 'NotEnoughTokens',
            message: 'Not enough tokens to pay the fee',
          });
          return;
        }
        return this.tokenContract.methods.approve(this.enigmaContract.options.address, fee).send(this.txDefaults)
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
        return this.enigmaContract.methods.createTaskRecord(taskId, fee, token, tokenValue).send(this.txDefaults)
          .on('transactionHash', (hash) => {
            emitter.emit('taskRecordTransactionHash', hash);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit('taskRecordConfirmation', confirmationNumber, receipt);
          })
          .on('receipt', (receipt) => {
            const event = receipt.events.TaskRecordCreated;
            const taskRecord = new TaskRecord(
              event.returnValues.taskId,
              event.returnValues.fee,
              event.returnValues.token,
              event.returnValues.tokenValue,
              event.transactionHash,
              receipt,
            );
            emitter.emit('taskRecordReceipt', taskRecord);
          });
      })
      .catch((err) => {
        emitter.emit('error', err);
      });
    return emitter;
  }

  /**
   * Store multiple task records
   */
  createTaskRecords(taskRecords, options = {}) {
    options = Object.assign({}, this.txDefaults, options);
    let taskIds = [];
    let fees = [];
    let tokens = [];
    let tokenValues = [];
    taskRecords.forEach((taskRecord) => {
      taskIds.push(taskRecord.taskId);
      fees.push(taskRecord.fee);
      tokens.push(taskRecord.token || this.tokenContract.options.address);
      tokenValues.push(taskRecord.tokenValue || 0);
    });
    let emitter = new EventEmitter();
    console.log('creating task records', taskIds, fees, tokens, tokenValues);
    this.tokenContract.methods.balanceOf(this.txDefaults.from).call()
      .then((balance) => {
        let totalFees = fees.reduce((a, b) => a + b, 0);
        if (balance < totalFees) {
          emitter.emit('error', {
            name: 'NotEnoughTokens',
            message: 'Not enough tokens to pay the fee',
          });
          return;
        }
        return this.tokenContract.methods.approve(this.enigmaContract.options.address, totalFees).send(this.txDefaults)
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
        return this.enigmaContract.methods.createTaskRecords(taskIds, fees, tokens, tokenValues).send(this.txDefaults)
          .on('transactionHash', (hash) => {
            emitter.emit('taskRecordsTransactionHash', hash);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            emitter.emit('taskRecordsConfirmation', confirmationNumber, receipt);
          })
          .on('receipt', (receipt) => {
            const event = receipt.events.TaskRecordsCreated;
            let taskRecords = [];
            for (let i = 0; i < event.returnValues.taskIds.length; i++) {
              const taskRecord = new TaskRecord(
                event.returnValues.taskIds[i],
                event.returnValues.fees[i],
                event.returnValues.tokens[i],
                event.returnValues.tokenValues[i],
                event.transactionHash,
                receipt,
              );
              taskRecords.push(taskRecord);
            }
            emitter.emit('taskRecordsReceipt', taskRecords);
          });
      })
      .catch((err) => {
        emitter.emit('error', err);
      });
    return emitter;
  }

  /**
   * Find an existing task
   *
   * @param {string} taskId
   */
  getTask(taskId) {
    return this.enigmaContract.methods.tasks(taskId).call().then((result) => {
      console.log('the task', result);
      return new TaskResult(
        taskId,
        // encryptedInputs??
        [],
        result.sig,
        result.status,
      );
    });
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
  getReport(custodian) {
    return this.enigmaContract.methods.getReport(custodian).call().then((result) => {
      console.log('the task', result);
      return result;
    });
  }

  /**
   *
   * @param blockNumber
   * @return {Promise}
   */
  getWorkerParams(blockNumber) {
    return this.enigmaContract.methods.getWorkerParams(blockNumber).call().then((result) => {
      console.log('the worker params', result);
      const params = {
        firstBlockNumber: parseInt(result[0]),
        seed: parseInt(result[1]),
        workers: result[2],
        balances: result[3].map((x) => parseInt(x)),
      };
      return params;
    });
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
   * Store a task record on chain
   *
   * @param {string} taskId
   * @param {string} fn
   * @param {Array} args
   * @param {string} scAddr
   * @param {string} userPubKey
   */
  createTaskInput(taskId, fn, args, scAddr, userPubKey) {
    console.log('creating task input', taskId);
    // TODO: approve the fee
    let emitter = new EventEmitter();
    let blockNumber;
    let contractSelectedWorker;
    let clientPrivateKey;
    let encryptedInputs;

    this.web3.eth.getBlockNumber()
      .then((bn) => {
        blockNumber = bn;
        return this.getWorkerParams(blockNumber);
      })
      .then((params) => {
        contractSelectedWorker = this.selectWorkerGroup(blockNumber, scAddr, params, 5)[0];
        return contractSelectedWorker;
      })
      .then((contractSelectedWorker) => {
        console.log('1. Selected worker:', contractSelectedWorker);
        return new Promise((resolve, reject) => {
          this.client.request('getWorkerEncryptionKey', [contractSelectedWorker], (err, error, result) => {
            if (err) {
              reject(err);
            }
            resolve(result);
          });
        });
      })
      .then((getWorkerEncryptionKeyResult) => {
        let enclavePublicKey = getWorkerEncryptionKeyResult[0];
        // let enclaveSig = getWorkerEncryptionKeyResult[1];
        // TODO: verify signature
        // this.web3.eth.accounts.recover(enclavePublicKey, enclaveSig) === contractSelectedWorker
        return enclavePublicKey;
      })
      .then((enclavePublicKey) => {
        console.log('2. Got worker encryption key:', enclavePublicKey);
        // TODO: generate client key pair
        clientPrivateKey = '853ee410aa4e7840ca8948b8a2f67e9a1c2f4988ff5f4ec7794edf57be421ae5';
        let derivedKey = utils.getDerivedKey(enclavePublicKey, clientPrivateKey);
        encryptedInputs = args.map((arg) => utils.encryptMessage(derivedKey, arg));
      })
      .then(() => {
        console.log('3. Encrypted inputs:', encryptedInputs);
        const msg = this.web3.utils.soliditySha3(
          {t: 'bytes', v: utils.encodeArguments(encryptedInputs)},
        );
        const sig = utils.sign(clientPrivateKey, msg);
        console.log('4. Signed RLP-encoded encrypted inputs:', sig);
        return sig;
      })
      .then((sig) => {
        let task = new TaskInput(taskId, blockNumber, this.txDefaults.from, scAddr, fn,
          utils.encodeArguments(encryptedInputs), sig, userPubKey);
        emitter.emit('createTaskInput', task);
      });
    return emitter;
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
