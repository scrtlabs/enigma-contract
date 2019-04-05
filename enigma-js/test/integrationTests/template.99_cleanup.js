/* eslint-disable require-jsdoc */
import fs from 'fs';
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
  let epochSize;
  let sampleContract;
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

  it('initializes Sample contract', async () => {
    sampleContract = new enigma.web3.eth.Contract(SampleContract['abi'],
      SampleContract.networks['4447'].address);
    expect(sampleContract.options.address).toBeTruthy;
  });

  it('should clean up', async() => {
    // Log out
    await new Promise((resolve, reject) => {
      enigma.admin.logout(accounts[0])
        .on(eeConstants.LOGOUT_RECEIPT, (result) => {
          resolve(result);
        })
        .on(eeConstants.ERROR, (err) => {
          reject(err);
        });
    });
    let workerStatus = await enigma.admin.getWorkerStatus(accounts[0]);
    expect(workerStatus).toEqual(2);

    // Advance epoch to be able to withdraw
    const epochSize = await enigma.enigmaContract.methods.getEpochSize().call();
    for (let i = 0; i < epochSize; i++) {
      await sampleContract.methods.incrementCounter().send({from: accounts[8]});
    }

    // Wait for 2s for the Ppal node to pick up the new epoch
    await sleep(2000);

    // Withdraw stake
    const bal = parseInt((await enigma.enigmaContract.methods.getWorker(accounts[0]).call()).balance);
    await expect(new Promise((resolve, reject) => {
      enigma.admin.withdraw(accounts[0], bal)
        .on(eeConstants.WITHDRAW_RECEIPT, (result) => resolve(result))
        .on(eeConstants.ERROR, (err) => {
          reject(err);
        });
    }));
    const endingBalance = parseInt((await enigma.enigmaContract.methods.getWorker(accounts[0]).call()).balance);
    expect(endingBalance).toEqual(0);
  });

});
