/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import * as eeConstants from '../../src/emitterConstants';
import {EnigmaContract, EnigmaTokenContract} from './contractLoader';
import EthCrypto from 'eth-crypto';
import EventEmitter from "eventemitter3";
import Task from "../../src/models/Task";
import * as constants from './testConstants';


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  let epochSize;
  let workerAddress;
  it('initializes', () => {
    const provider = new Web3.providers.HttpProvider('http://localhost:9545');
    web3 = new Web3(provider);
    return web3.eth.getAccounts().then((result) => {
      accounts = result;
      enigma = new Enigma(
        web3,
        EnigmaContract.networks['4447'].address,
        EnigmaTokenContract.networks['4447'].address,
        'http://localhost:3346',
        {
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        },
      );
      enigma.admin();
      expect(Enigma.version()).toEqual('0.0.1');
    });
  });

  function createWrongWorkerTask(fn, args, gasLimit, gasPx, sender, scAddrOrPreCode, isContractDeploymentTask) {
    let emitter = new EventEmitter();
    (async () => {
      const nonce = parseInt(await enigma.enigmaContract.methods.getUserTaskDeployments(sender).call());
      const scAddr = isContractDeploymentTask ? utils.generateScAddr(sender, nonce) : scAddrOrPreCode;
      const preCode = isContractDeploymentTask ? scAddrOrPreCode : '';

      let preCodeArray = [];
      for (let n = 0; n < preCode.length; n += 2) {
        preCodeArray.push(parseInt(preCode.substr(n, 2), 16));
      }

      const preCodeHash = isContractDeploymentTask ?
        enigma.web3.utils.soliditySha3({t: 'bytes', value: scAddrOrPreCode}) : '';
      const argsTranspose = (args === undefined || args.length === 0) ? [[], []] :
        args[0].map((col, i) => args.map((row) => row[i]));
      const abiEncodedArgs = utils.remove0x(enigma.web3.eth.abi.encodeParameters(argsTranspose[1], argsTranspose[0]));
      let abiEncodedArgsArray = [];
      for (let n = 0; n < abiEncodedArgs.length; n += 2) {
        abiEncodedArgsArray.push(parseInt(abiEncodedArgs.substr(n, 2), 16));
      }
      const blockNumber = await enigma.web3.eth.getBlockNumber();
      const workerParams = await enigma.getWorkerParams(blockNumber);
      const firstBlockNumber = workerParams.firstBlockNumber;
      workerAddress = await enigma.selectWorkerGroup(scAddr, workerParams, 1)[0]; // TODO: tmp fix 1 worker

      let wrongWorkerAddress = workerParams.workers.filter(function(value, index, arr) { 
        return value != workerAddress;})[0];

      wrongWorkerAddress = wrongWorkerAddress.toLowerCase().slice(-40); // remove leading '0x' if present
      const {publicKey, privateKey} = enigma.obtainTaskKeyPair();
      try {
        const getWorkerEncryptionKeyResult = await new Promise((resolve, reject) => {
          enigma.client.request('getWorkerEncryptionKey',
            {workerAddress: wrongWorkerAddress, userPubKey: publicKey}, (err, response) => {
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
          enigma.web3.utils.soliditySha3({t: 'bytes', value: hexToVerify}));

        recAddress = recAddress.toLowerCase().slice(-40); // remove leading '0x' if present

        if (wrongWorkerAddress !== recAddress) {
          console.error('Worker address', wrongWorkerAddress, '!= recovered address', recAddress);
          emitter.emit(eeConstants.ERROR, {
            name: 'InvalidWorker',
            message: `Invalid worker encryption key + signature combo ${wrongWorkerAddress} != ${recAddress}`,
          });
        } else {
          // Generate derived key from worker's encryption key and user's private key
          const derivedKey = utils.getDerivedKey(workerEncryptionKey, privateKey);
          // Encrypt function and ABI-encoded args
          const encryptedFn = utils.encryptMessage(derivedKey, fn);
          const encryptedAbiEncodedArgs = utils.encryptMessage(derivedKey, Buffer.from(abiEncodedArgsArray));
          const msg = enigma.web3.utils.soliditySha3(
            {t: 'bytes', v: encryptedFn},
            {t: 'bytes', v: encryptedAbiEncodedArgs},
          );
          const userTaskSig = await enigma.web3.eth.sign(msg, sender);
          emitter.emit(eeConstants.CREATE_TASK, new Task(scAddr, encryptedFn, encryptedAbiEncodedArgs, gasLimit, gasPx,
            id, publicKey, firstBlockNumber, wrongWorkerAddress, workerEncryptionKey, sender, userTaskSig, nonce,
            preCodeArray, preCodeHash, isContractDeploymentTask));
        }
      } catch (err) {
        emitter.emit(eeConstants.ERROR, err);
      }
    })();
    return emitter;
  }

  const homedir = os.homedir();
  const calculatorAddr = fs.readFileSync(path.join(homedir, '.enigma', 'addr-calculator.txt'), 'utf-8');
  let task;
  it('should execute compute task', async () => {
    let taskFn = 'sub(uint256,uint256)';
    let taskArgs = [
      [76, 'uint256'],
      [17, 'uint256'],
    ];
    let taskGasLimit = 100000;
    let taskGasPx = utils.toGrains(1);

    task = await new Promise((resolve, reject) => {
      createWrongWorkerTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], calculatorAddr, false)
        .on(eeConstants.CREATE_TASK, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    task = await new Promise((resolve, reject) => {
      enigma.createTaskRecord(task)
        .on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    await new Promise((resolve, reject) => {
      enigma.sendTaskInput(task)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  });

  it('should get the pending task', async () => {
    task = await enigma.getTaskRecordStatus(task);
    expect(task.ethStatus).toEqual(1);
  });

  it('should get the failed task receipt', async () => {
    let i = 0;
    do {
      await sleep(1000);
      task = await enigma.getTaskRecordStatus(task);
      process.stdout.write('Waiting. Current Task Status is '+task.ethStatus+'\r');
      i++;
    } while (task.ethStatus === 1 && i < 6);
    expect(task.ethStatus).toEqual(1);
    process.stdout.write('Completed. Final Task Status is '+task.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

});
