/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import forge from 'node-forge';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import EnigmaContract from '../../../build/contracts/Enigma';
import EnigmaTokenContract from '../../../build/contracts/EnigmaToken';
import SampleContract from '../../../build/contracts/Sample';
import * as eeConstants from '../../src/emitterConstants';
import data from '../data';
import EthCrypto from 'eth-crypto';


forge.options.usePureJavaScript = true;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  let sampleContract;
  let epochSize;
  it('initializes', () => {
    const provider = new Web3.providers.HttpProvider('http://localhost:9545');
    web3 = new Web3(provider);
    return web3.eth.getAccounts().then((result) => {
      accounts = result;
      console.log('the accounts', accounts);
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

  const homedir = os.homedir();
  const calculatorAddr = fs.readFileSync(path.join(homedir, '.enigma', 'addr-calculator.txt'), 'utf-8');
  let task1;
  it('should execute compute task', async () => {
    let taskFn = 'sub(uint256,uint256)';
    let taskArgs = [
      [76, 'uint256'],
      [17, 'uint256'],
    ];
    let taskGasLimit = 100000;
    let taskGasPx = utils.toGrains(1);
    task1 = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], calculatorAddr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  });

  it('should get the pending task', async () => {
    task1 = await enigma.getTaskRecordStatus(task1);
    expect(task1.ethStatus).toEqual(1);
  });

  it('should get the confirmed task', async () => {
    do {
      task1 = await enigma.getTaskRecordStatus(task1);
      console.log(task1.ethStatus);
      await sleep(1000);
    } while (task1.ethStatus != 2);
    expect(task1.ethStatus).toEqual(2);
  }, 10000);

  it('should get the result and verify the computation is correct', async () => {
    task1 = await new Promise((resolve, reject) => {
      enigma.getTaskResult(task1)
        .on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(task1.engStatus).toEqual('SUCCESS');
    expect(task1.encryptedAbiEncodedOutputs).toBeTruthy();
    task1 = await enigma.decryptTaskResult(task1);
    expect(task1.usedGas).toBeTruthy();
    expect(task1.workerTaskSig).toBeTruthy();
    expect(parseInt(task1.decryptedOutput, 16)).toEqual(76-17);
  });

  let task2;
  it('should execute compute task', async () => {
    let taskFn = 'mul(uint256,uint256)';
    let taskArgs = [
      [76, 'uint256'],
      [17, 'uint256'],
    ];
    let taskGasLimit = 100000;
    let taskGasPx = utils.toGrains(1);
    task2 = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], calculatorAddr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    console.log(task2);
  });

  it('should get the pending task', async () => {
    task2 = await enigma.getTaskRecordStatus(task2);
    expect(task2.ethStatus).toEqual(1);
  });

  it('should get the confirmed task', async () => {
    do {
      task2 = await enigma.getTaskRecordStatus(task2);
      console.log(task2.ethStatus);
      await sleep(1000);
    } while (task2.ethStatus != 2);
    expect(task2.ethStatus).toEqual(2);
  }, 10000);

  it('should get and validate the result', async () => {
    task2 = await new Promise((resolve, reject) => {
      enigma.getTaskResult(task2)
        .on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(task2.engStatus).toEqual('SUCCESS');
    expect(task2.encryptedAbiEncodedOutputs).toBeTruthy();
    task2 = await enigma.decryptTaskResult(task2);
    expect(task2.usedGas).toBeTruthy();
    expect(task2.workerTaskSig).toBeTruthy();
    expect(parseInt(task2.decryptedOutput, 16)).toEqual(76*17);
  });

});
