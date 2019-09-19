/* eslint-disable require-jsdoc */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import * as eeConstants from '../../src/emitterConstants';
import {EnigmaContract, EnigmaTokenContract, SampleContract} from './contractLoader';
import * as constants from './testConstants';

dotenv.config();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  let epochSize;
  let sampleContract;

  let nodes = parseInt((typeof process.env.NODES !== 'undefined') ? process.env.NODES : 1);

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

  it('initializes Sample contract', async () => {
    sampleContract = new enigma.web3.eth.Contract(SampleContract['abi'],
      SampleContract.networks['4447'].address);
    expect(sampleContract.options.address).toBeTruthy;
  });

  it('should clean up', async() => {
    // Log out
    let promises = [];
    for (let i = 0; i < nodes; i++) {
      let promise = new Promise((resolve, reject) => {
        enigma.admin.logout(accounts[i])
          .on(eeConstants.LOGOUT_RECEIPT, (result) => {
            resolve(result);
          })
          .on(eeConstants.ERROR, (err) => {
            reject(err);
          });
      });
      promises.push(promise);
    }
    const logoutReceipts = await Promise.all(promises);
    expect(logoutReceipts.length).toEqual(nodes);

    let workerStatuses = []
    let resultsArray = [];
    for(let i = 0; i < nodes; i++) {
      workerStatuses.push(await enigma.admin.getWorkerStatus(accounts[i]));
      resultsArray[i] = 2;
    }
    expect(workerStatuses).toEqual(resultsArray);

    // Advance epoch to be able to withdraw
    const epochSize = await enigma.enigmaContract.methods.getEpochSize().call();
    for (let i = 0; i < epochSize; i++) {
      await sampleContract.methods.incrementCounter().send({from: accounts[8]});
    }

    // Wait for 2s for the Ppal node to pick up the new epoch
    await sleep(2000);

    // Withdraw stake
    promises = [];
    for (let i = 0; i < nodes; i++) {
      let bal = parseInt((await enigma.enigmaContract.methods.getWorker(accounts[i]).call()).balance);
      let promise = new Promise((resolve, reject) => {
        enigma.admin.withdraw(accounts[i], bal).
          on(eeConstants.WITHDRAW_RECEIPT, (result) => resolve(result)).
          on(eeConstants.ERROR, (err) => {
            reject(err);
          });
      });
      promises.push(promise);
    }
    const results = await Promise.all(promises);
    expect(results.length).toEqual(nodes);

    // Check balances are zero
    let endingBalances = [];
    resultsArray = [];
    for (let i = 0; i < nodes; i++) {
      endingBalances[i] = parseInt((await enigma.enigmaContract.methods.getWorker(accounts[i]).call()).balance);
      resultsArray[i] = 0;
    }
    expect(endingBalances).toEqual(resultsArray);
  }, constants.TIMEOUT_CLEANUP);

});
