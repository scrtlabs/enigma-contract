/* eslint-disable require-jsdoc */
import chai from 'chai';
import {Enigma, utils} from '../lib/enigma-js';
import forge from 'node-forge';
import Web3 from 'web3';
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import data from './data';

forge.options.usePureJavaScript = true;
chai.expect();

const expect = chai.expect;

function todo() {
  throw new Error('not implemented');
};

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
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
        {
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        },
      );
      expect(enigma.version()).to.be.equal('0.0.1');
    });
  });

  it('should simulate worker registration', () => {
    const enigmaContract = enigma.enigmaContract;
    let promises = [];
    for (let i = 0; i < accounts.length; i++) {
      let worker = (i === 9) ? data.principal : data.worker;
      if (i === 9) {
        console.log('setting principal node', worker[0]);
      }
      const report = utils.encodeReport(
        worker[1],
        worker[2],
        worker[3],
      );
      // Using the same artificial data for all workers
      let promise = new Promise((resolve, reject) => {
        enigmaContract.methods.register(worker[0], report).
          send({
            gas: 4712388,
            gasPrice: 100000000000,
            from: accounts[i],
          }).
          on('receipt', (receipt) => resolve(receipt)).
          on('error', (error) => reject(error));
      });
      promises.push(promise);
    }
    // Using the account as the signer for testing purposes
    return Promise.all(promises).then((receipts) => {
      receipts.forEach((receipt) => {
        console.log('worker registered: ', receipt);
        expect(receipt.events.Registered).not.to.be.empty;
      });
    });
  });

  it('should get the worker report', () => {
    todo();
  });

  let taskId;
  it('should create task record', () => {
    return web3.eth.getBlockNumber().
      then((blockNumber) => {
        const fn = 'medianWealth(int32,int32)';
        const args = [200000, 300000];
        const scAddr = '0x9d075ae44d859191c121d7522da0cc3b104b8837';
        const userPubKey = '04f542371d69af8ebe7c8a00bdc5a9d9f39969406d6c1396037' +
          'ede55515845dda69e42145834e631628c628812d85c805e9da1c56415b32cf99d5ae900f1c1565c';
        taskId = utils.generateTaskId(fn, args, scAddr, blockNumber, userPubKey);
        const fee = 300;
        return new Promise((resolve, reject) => {
          enigma.createTaskRecord(taskId, fee).
            on('mined', (receipt) => resolve(receipt)).
            on('error', (error) => reject(error));
        });
      }).
      then((taskRecord) => {
        expect(taskRecord.receipt).not.to.be.empty;
      });
  });

  it('should get the pending task', () => {
    return enigma.getTask(taskId).then((task) => {
      console.log('the task', task);
      expect(task.status).to.be.equal(0);
    });
  });

  it('should simulate the task receipt', () => {
    todo();
  });

  it('should get the confirmed task', () => {
    todo();
  });

  it('should create multiple task records', () => {
    return web3.eth.getBlockNumber().
      then((blockNumber) => {
        const fn = 'medianWealth(int32,int32)';
        const scAddr = '0x9d075ae44d859191c121d7522da0cc3b104b8837';
        const userPubKey = '04f542371d69af8ebe7c8a00bdc5a9d9f39969406d6c1396037' +
          'ede55515845dda69e42145834e631628c628812d85c805e9da1c56415b32cf99d5ae900f1c1565c';
        const fee = 300;
        const args1 = [200000, 300000];
        const taskId1 = utils.generateTaskId(fn, args1, scAddr, blockNumber, userPubKey);
        const taskRecord1 = {taskId: taskId1, fee: fee};
        const args2 = [300000, 400000];
        const taskId2 = utils.generateTaskId(fn, args2, scAddr, blockNumber, userPubKey);
        const taskRecord2 = {taskId: taskId2, fee: fee};
        const taskRecords = [taskRecord1, taskRecord2];

        console.log('creating task records', taskRecords);
        return new Promise((resolve, reject) => {
          enigma.createTaskRecords(taskRecords).
            on('mined', (receipt) => resolve(receipt)).
            on('error', (error) => reject(error));
        });
      }).
      then((taskRecord) => {
        expect(taskRecord).not.to.be.empty;
      });
  });

  it('should get the pending tasks', () => {
    todo();
  });

  it('should simulate multiple task receipts', () => {
    todo();
  });

  it('should get the confirmed tasks', () => {
    todo();
  });
});
