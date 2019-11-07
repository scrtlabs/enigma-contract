/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import * as eeConstants from '../../src/emitterConstants';
import {EnigmaContract, EnigmaTokenContract, EnigmaContractAddress, EnigmaTokenContractAddress,
  proxyAddress, ethNodeAddr} from './contractLoader';
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
    const provider = new Web3.providers.HttpProvider(ethNodeAddr);
    web3 = new Web3(provider);
    return web3.eth.getAccounts().then((result) => {
      accounts = result;
      enigma = new Enigma(
        web3,
        EnigmaContractAddress,
        EnigmaTokenContractAddress,
        proxyAddress,
        {
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        },
      );
      enigma.admin();
      enigma.setTaskKeyPair('cupcake');
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
  }, constants.TIMEOUT_COMPUTE);

  it('should get the pending task', async () => {
    task1 = await enigma.getTaskRecordStatus(task1);
    expect(task1.ethStatus).toEqual(1);
  });

  it('should get the confirmed task', async () => {
    do {
      await sleep(1000);
      task1 = await enigma.getTaskRecordStatus(task1);
      process.stdout.write('Waiting. Current Task Status is '+task1.ethStatus+'\r');
    } while (task1.ethStatus != 2);
    expect(task1.ethStatus).toEqual(2);
    process.stdout.write('Completed. Final Task Status is '+task1.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

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
  }, constants.TIMEOUT_COMPUTE);

  it('should get the pending task', async () => {
    task2 = await enigma.getTaskRecordStatus(task2);
    expect(task2.ethStatus).toEqual(1);
  });

  it('should get the confirmed task', async () => {
    do {
      await sleep(1000);
      task2 = await enigma.getTaskRecordStatus(task2);
      process.stdout.write('Waiting. Current Task Status is '+task2.ethStatus+'\r');
    } while (task2.ethStatus != 2);
    expect(task2.ethStatus).toEqual(2);
    process.stdout.write('Completed. Final Task Status is '+task2.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

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
