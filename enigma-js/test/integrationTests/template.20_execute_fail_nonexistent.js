/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import * as eeConstants from '../../src/emitterConstants';
import {EnigmaContract, EnigmaTokenContract} from './contractLoader';
import * as constants from './testConstants';


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  let epochSize;
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

  it('should generate and save key/pair', () => {
    enigma.setTaskKeyPair('cupcake');
  });

  let task;
  it('should execute compute task', async () => {
    let nonExistentAddr = '0x1234567890123456789012345678901234567890123456789012345678901234'
    let taskFn = 'function()';
    let taskArgs = '';
    let taskGasLimit = 1000;
    let taskGasPx = utils.toGrains(1);
    task = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], nonExistentAddr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  });

  it('should get the pending task', async () => {
    task = await enigma.getTaskRecordStatus(task);
    expect(task.ethStatus).toEqual(1);
  });

  it('should get the failed task receipt', async () => {
    do {
      await sleep(1000);
      task = await enigma.getTaskRecordStatus(task);
      process.stdout.write('Waiting. Current Task Status is '+task.ethStatus+'\r');
    } while (task.ethStatus != 3);
    expect(task.ethStatus).toEqual(3);
    process.stdout.write('Completed. Final Task Status is '+task.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

  xit('should get the failed result', async () => {
    task = await new Promise((resolve, reject) => {
        enigma.getTaskResult(task)
          .on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result))
          .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(task.engStatus).toEqual('FAILED');
    expect(task.encryptedAbiEncodedOutputs).toBeTruthy();
    expect(task.usedGas).toBeTruthy();
    expect(task.workerTaskSig).toBeTruthy();
  });

});
