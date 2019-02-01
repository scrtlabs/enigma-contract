/* eslint-disable require-jsdoc */
import forge from 'node-forge';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import EnigmaContract from '../../../build/contracts/Enigma';
import EnigmaTokenContract from '../../../build/contracts/EnigmaToken';
import data from '../data';

forge.options.usePureJavaScript = true;

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
      console.log('the accounts', accounts);
      console.log(Enigma);
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

  let workerAddress;
  it('should check that one worker, and only one worker, is registered', async () => {
    let workerStatuses = [];
    for (let i = 0; i < accounts.length; i++) {
      workerStatuses.push(await enigma.admin.getWorkerStatus(accounts[i]));
    }
    expect(workerStatuses).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    workerAddress = await enigma.admin.getWorkerSignerAddr(accounts[0]));
  });

  const userPubKey = '2ea8e4cefb78efd0725ed12b23b05079a0a433cc8a656f212accf58672fee44a20cfcaa50466237273e762e49ec'+
    '912be61358d5e90bff56a53a0ed42abfe27e3';
  it('should create getTaskEncryptionKey from core (with call to P2P)', async () => {
    const encryptionKeyResult = await new Promise((resolve, reject) => {
        enigma.client.request('getWorkerEncryptionKey', [workerAddress, userPubKey], (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      });
    console.log(encryptionKeyResult)

    expect(encryptionKeyResult.workerEncryptionKey.length).toBe(128);
    expect(encryptionKeyResult.workerSig.length).toBe(130);


    // taskInput = await new Promise((resolve, reject) => {
    //   enigma.createTaskInput(fn, args, scAddr, accounts[0], userPubKey, fee)
    //     .on('createTaskInputReceipt', (receipt) => resolve(receipt))
    //     .on('error', (error) => reject(error));
    // });
    // console.log('Task input', taskInput);
    // expect(taskInput).not.to.be.empty;
    // expect(taskInput.sender).to.equal(accounts[0]);
    // expect(taskInput.scAddr).to.equal(scAddr);
    // expect(taskInput.userPubKey).to.equal(userPubKey);
    // const msg = web3.utils.soliditySha3(
    //     {t: 'bytes', v: taskInput.encryptedFn},
    //     {t: 'bytes', v: taskInput.encryptedEncodedArgs},
    //   );
    // expect(utils.recover(taskInput.userTaskSig, msg)).to.equal(utils.toAddress(userPubKey));
    // expect(taskInput.fee).to.equal(fee);
  });

});
