/* eslint-disable require-jsdoc */
import dotenv from 'dotenv';
import forge from 'node-forge';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import EnigmaContract from '../../../build/contracts/Enigma';
import EnigmaTokenContract from '../../../build/contracts/EnigmaToken';
import SampleContract from '../../../build/contracts/Sample';
import * as eeConstants from '../../src/emitterConstants';

dotenv.config();

forge.options.usePureJavaScript = true;


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Init tests', () => {
  let accounts;
  let web3;
  let enigma;
  let sampleContract;
  let epochSize;

  let nodes = parseInt((typeof process.env.NODES !== 'undefined') ? process.env.NODES : 1);

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

  it('should distribute ENG tokens', async () => {
    const tokenContract = enigma.tokenContract;
    let promises = [];
    const allowance = utils.toGrains(1000);
    for (let i = 1; i < accounts.length - 1; i++) {
      let promise = new Promise(async (resolve, reject) => {
        await tokenContract.methods.approve(accounts[i], allowance).send(enigma.txDefaults);
        const transferResult = await tokenContract.methods.transfer(accounts[i], allowance).send(enigma.txDefaults);
        resolve(transferResult);
      });
      promises.push(promise);
    }
    const results = await Promise.all(promises);
    expect(results.length).toEqual(accounts.length - 2);
  });

  let workerAddress=[];
  it('should check that '+nodes+' worker(s) and the principal node, and only them, are registered', async () => {
    let workerStatuses = [];
    for (let i = 0; i < 10; i++) {
      workerStatuses.push(await enigma.admin.getWorkerStatus(accounts[i]));
    }
    let arrayResults = [0, 0, 0, 0, 0, 0, 0, 0, 0, 2];
    for(let i = 0; i < nodes; i++){
      arrayResults[i] = 2;
      workerAddress[i] = await enigma.admin.getWorkerSignerAddr(accounts[i]);
    }
    expect(workerStatuses).toEqual(arrayResults);
    console.log('WorkerAddresses are '+workerAddress);
  });

  it('should check worker\'s stake balance is empty', async () => {
    let balance = await enigma.admin.getBalance(accounts[0]);
    expect(balance).toEqual(0);
  });

  it('should get the worker parameters for the current block', async () => {
    const blockNumber = await web3.eth.getBlockNumber();
    const workerParams = await enigma.getWorkerParams(blockNumber);
    expect(workerParams.workers).toEqual([]);
    expect(workerParams.stakes).toEqual([]);
  });

  const deposit = 900;
  it('should deposit tokens in worker banks', async () => {
    let promises = [];
      for (let i = 0; i < nodes; i++) {
        let promise = new Promise((resolve, reject) => {
          enigma.admin.deposit(accounts[i], utils.toGrains(deposit)).
            on(eeConstants.DEPOSIT_RECEIPT, (result) => resolve(result)).
            on(eeConstants.ERROR, (err) => {
              reject(err);
            });
        });
        promises.push(promise);
      }
      const results = await Promise.all(promises);
      expect(results.length).toEqual(nodes);
  });

  it('should check workers\' balances have been filled', async () => {
    let balances = [];
    let arrayResult = [];
    for (let i = 0; i < nodes - 1; i++) {
      balances.push(await enigma.admin.getBalance(accounts[i]));
      arrayResult[i] = deposit * 10 ** 8;
    }
    expect(balances).toEqual(arrayResult);
  });

  it('should login the worker(s)', async () => {
    let promises = [];
    for (let i = 0; i < nodes; i++) {
      let promise = new Promise((resolve, reject) => {
        enigma.admin.login(accounts[i])
          .on(eeConstants.LOGIN_RECEIPT, (result) => {
            resolve(result);
          });
      });
      promises.push(promise);
    }
    const loginReceipts = await Promise.all(promises);
    expect(loginReceipts.length).toEqual(nodes);
  }, 20000);

  it('should check that '+nodes+' worker(s), and only them, are logged in', async () => {
    let workerStatuses = [];
    for (let i = 0; i < 10; i++) {
      workerStatuses.push(await enigma.admin.getWorkerStatus(accounts[i]));
    }
    let arrayResults = [0, 0, 0, 0, 0, 0, 0, 0, 0, 2];
    for(let i = 0; i < nodes; i++){
      arrayResults[i]=1;
    }
    expect(workerStatuses).toEqual(arrayResults);
  });

  it('should move forward epochSize blocks by calling dummy contract', async () => {
    const epochSize = await enigma.enigmaContract.methods.getEpochSize().call();
    for (let i = 0; i < epochSize; i++) {
      await sampleContract.methods.incrementCounter().send({from: accounts[8]});
    }
    // Wait for 2s for the Ppal node to pick up the new epoch
    await sleep(2000);
  }, 8000);

  it('should get the worker parameters for the current block', async () => {
    let blockNumber;
    let workerParams;
    do {
      blockNumber = await web3.eth.getBlockNumber();
      workerParams = await enigma.getWorkerParams(blockNumber);
      await sleep(1000);
    } while (!workerParams)
    expect(workerParams.workers.sort()).toEqual(workerAddress.sort());  // they may come in a different order
    expect(workerParams.stakes).toEqual(new Array(nodes).fill(web3.utils.toBN(900 * 10 ** 8)));
  }, 5000);

  const userPubKey = '2ea8e4cefb78efd0725ed12b23b05079a0a433cc8a656f212accf58672fee44a20cfcaa50466237273e762e49ec'+
    '912be61358d5e90bff56a53a0ed42abfe27e3';
  it('should create getTaskEncryptionKey from core (with call to P2P)', async () => {
    const encryptionKeyResult = await new Promise((resolve, reject) => {
        enigma.client.request('getWorkerEncryptionKey', 
          {workerAddress: workerAddress[0].toLowerCase().slice(-40), userPubKey: userPubKey}, (err, response) => {
            if (err) {
              reject(err);
            }
            resolve(response);
        });
      });
    console.log(encryptionKeyResult)

    expect(encryptionKeyResult.result.workerEncryptionKey.length).toBe(128);
    expect(encryptionKeyResult.result.workerSig.length).toBe(130);
  });
});
