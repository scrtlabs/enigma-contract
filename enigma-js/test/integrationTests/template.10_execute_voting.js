/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import * as eeConstants from '../../src/emitterConstants';
import {EnigmaContract, EnigmaTokenContract} from './contractLoader'
import VotingETHContract from '../../../build/contracts/VotingETH';
import * as constants from './testConstants';


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  let votingETHContract;
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

  it('initializes VotingETH contract', async () => {
    votingETHContract = new enigma.web3.eth.Contract(VotingETHContract['abi'],
      VotingETHContract.networks['4447'].address);
    expect(votingETHContract.options.address).toBeTruthy();
  });

  const homedir = os.homedir();
  const votingAddr = fs.readFileSync(path.join(homedir, '.enigma', 'addr-voting.txt'), 'utf-8');

  it('creates a new poll on ETH', async () => {
    const initialPollsLength = (await votingETHContract.methods.getPolls().call()).length;
    await votingETHContract.methods.createPoll(50, "Is privacy important?", 30).send({
      gas: 4712388,
      gasPrice: 100000000000,
      from: accounts[0],
    });
    const finalPollsLength = (await votingETHContract.methods.getPolls().call()).length;
    expect(finalPollsLength - initialPollsLength).toEqual(1);
  });

  let task1;
  const addr1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
  it('should execute compute task: voter 1 casting vote', async () => {
    const pollId = (await votingETHContract.methods.getPolls().call()).length - 1;
    let taskFn = 'cast_vote(uint256,bytes32,uint256)';
    let taskArgs = [
      [pollId, 'uint256'],
      [addr1, 'bytes32'],
      [1, 'uint256'],
    ];
    let taskGasLimit = 1000000;
    let taskGasPx = utils.toGrains(1);
    task1 = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], votingAddr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  }, constants.TIMEOUT_COMPUTE);

  it('should get the pending task', async () => {
    task1 = await enigma.getTaskRecordStatus(task1);
    expect(task1.ethStatus).toEqual(1);
  });

  it('should get the confirmed task success', async () => {
    do {
      await sleep(1000);
      task1 = await enigma.getTaskRecordStatus(task1);
      process.stdout.write('Waiting. Current Task Status is '+task1.ethStatus+'\r');
    } while (task1.ethStatus !== 2);
    expect(task1.ethStatus).toEqual(2);
    process.stdout.write('Completed. Final Task Status is '+task1.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

  let task2;
  const addr2 = '0x0000000000000000000000000000000000000000000000000000000000000002';
  it('should fail to execute compute task: voter 1 casting vote to poll again', async () => {
    const pollId = (await votingETHContract.methods.getPolls().call()).length - 1;
    let taskFn = 'cast_vote(uint256,bytes32,uint256)';
    let taskArgs = [
      [pollId, 'uint256'],
      [addr1, 'bytes32'],
      [0, 'uint256'],
    ];
    let taskGasLimit = 1000000;
    let taskGasPx = utils.toGrains(1);
    task2 = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], votingAddr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  }, constants.TIMEOUT_COMPUTE);

  it('should get the pending task', async () => {
    task2 = await enigma.getTaskRecordStatus(task2);
    expect(task2.ethStatus).toEqual(1);
  });

  it('should get the confirmed task success', async () => {
    do {
      await sleep(1000);
      task2 = await enigma.getTaskRecordStatus(task2);
      process.stdout.write('Waiting. Current Task Status is '+task2.ethStatus+'\r');
    } while (task2.ethStatus !== 3);
    expect(task2.ethStatus).toEqual(3);
    process.stdout.write('Completed. Final Task Status is '+task2.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

  it('should execute compute task: voter 2 casting vote', async () => {
    const pollId = (await votingETHContract.methods.getPolls().call()).length - 1;
    let taskFn = 'cast_vote(uint256,bytes32,uint256)';
    let taskArgs = [
      [pollId, 'uint256'],
      [addr2, 'bytes32'],
      [0, 'uint256'],
    ];
    let taskGasLimit = 1000000;
    let taskGasPx = utils.toGrains(1);
    task2 = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], votingAddr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  }, constants.TIMEOUT_COMPUTE);

  it('should get the pending task', async () => {
    task2 = await enigma.getTaskRecordStatus(task2);
    expect(task2.ethStatus).toEqual(1);
  });

  it('should get the confirmed task success', async () => {
    do {
      await sleep(1000);
      task2 = await enigma.getTaskRecordStatus(task2);
      process.stdout.write('Waiting. Current Task Status is '+task2.ethStatus+'\r');
    } while (task2.ethStatus !== 2);
    expect(task2.ethStatus).toEqual(2);
    process.stdout.write('Completed. Final Task Status is '+task2.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

  let task3;
  it('should fail to execute compute task to tally poll when poll has not expired', async () => {
    const pollId = (await votingETHContract.methods.getPolls().call()).length - 1;
    let taskFn = 'tally_poll(uint256)';
    let taskArgs = [
      [pollId, 'uint256'],
    ];
    let taskGasLimit = 1000000;
    let taskGasPx = utils.toGrains(1);
    task3 = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], votingAddr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  }, constants.TIMEOUT_COMPUTE);

  it('should get the pending task', async () => {
    task3 = await enigma.getTaskRecordStatus(task3);
    expect(task3.ethStatus).toEqual(1);
  });

  it('should get the confirmed task success', async () => {
    do {
      await sleep(1000);
      task3 = await enigma.getTaskRecordStatus(task3);
      process.stdout.write('Waiting. Current Task Status is '+task3.ethStatus+'\r');
    } while (task3.ethStatus !== 4);
    expect(task3.ethStatus).toEqual(4);
    process.stdout.write('Completed. Final Task Status is '+task3.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

  it('checks poll is still pending on ETH', async () => {
    const polls = await votingETHContract.methods.getPolls().call();
    const pollId = polls.length - 1;
    expect(polls[pollId].status).toEqual('1');
  });

  let task4;
  it('should execute compute task: tally poll', async () => {
    const polls = await votingETHContract.methods.getPolls().call();
    const pollId = polls.length - 1;
    expect(polls[pollId].status).toEqual('1');
    let taskFn = 'tally_poll(uint256)';
    let taskArgs = [
      [pollId, 'uint256'],
    ];
    let taskGasLimit = 1000000;
    let taskGasPx = utils.toGrains(1);
    await sleep(30000);
    task4 = await new Promise((resolve, reject) => {
      enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], votingAddr)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  }, constants.TIMEOUT_COMPUTE_LONG);

  it('should get the pending task', async () => {
    task4 = await enigma.getTaskRecordStatus(task4);
    expect(task4.ethStatus).toEqual(1);
  });

  it('should get the confirmed task', async () => {
    do {
      await sleep(1000);
      task4 = await enigma.getTaskRecordStatus(task4);
      process.stdout.write('Waiting. Current Task Status is '+task4.ethStatus+'\r');
    } while (task4.ethStatus !== 2);
    expect(task4.ethStatus).toEqual(2);
    process.stdout.write('Completed. Final Task Status is '+task4.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE);

  it('checks poll has registered as passed on ETH', async () => {
    const polls = await votingETHContract.methods.getPolls().call();
    const pollId = polls.length - 1;
    expect(polls[pollId].status).toEqual('2');
  });
});
