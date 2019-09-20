/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import * as eeConstants from '../../src/emitterConstants';
import {EnigmaContract, EnigmaTokenContract} from './contractLoader';
import VotingETHContract from '../../../build/contracts/VotingETH';
import * as constants from './testConstants';


/**
 * Be sure to run this after 03_deploy_fail_wrong_eth_address.spec
 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  let votingETHContract;
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

  it('initializes VotingETH contract', async () => {
    votingETHContract = new enigma.web3.eth.Contract(VotingETHContract['abi'],
      VotingETHContract.networks['4447'].address);
    expect(votingETHContract.options.address).toBeTruthy();
  });

  const homedir = os.homedir();
  const votingAddr = fs.readFileSync(path.join(homedir, '.enigma', 'addr-voting-wrongeth.txt'), 'utf-8');

  let task1;
  const addr1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
  it('should fail to execute compute task: voter 1 casting vote', async () => {
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
  });

  it('should get the pending task', async () => {
    task1 = await enigma.getTaskRecordStatus(task1);
    expect(task1.ethStatus).toEqual(1);
  });

  it('should get the confirmed task failure (ENG)', async () => {
    do {
      await sleep(1000);
      task1 = await enigma.getTaskRecordStatus(task1);
      process.stdout.write('Waiting. Current Task Status is '+task1.ethStatus+'\r');
    } while (task1.ethStatus !== 3);
    expect(task1.ethStatus).toEqual(3);
    process.stdout.write('Completed. Final Task Status is '+task1.ethStatus+'\n');
  }, constants.TIMEOUT_COMPUTE_LONG);
});
