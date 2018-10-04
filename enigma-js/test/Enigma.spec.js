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
    return enigma.getReport(accounts[0]).then((report) => {
      expect(report).not.to.be.empty;
    });
  });

  const scAddr = '0x9d075ae44d859191c121d7522da0cc3b104b8837';
  let taskId;
  it('should create task record', () => {
    return web3.eth.getBlockNumber().
      then((blockNumber) => {
        const fn = 'medianWealth(int32,int32)';
        const args = [200000, 300000];
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
      expect(task.status).to.be.equal(0);
    });
  });

  let outStateDelta;
  it('should simulate the task receipt', () => {
    const enigmaContract = enigma.enigmaContract;
    const inStateDelta = '0x0000000000000000000000000000000000000000000000000000000000000000';
    outStateDelta = web3.utils.soliditySha3('test');
    const ethCall = web3.utils.soliditySha3('test');
    const proof = web3.utils.soliditySha3(
      {t: 'bytes32', v: taskId},
      {t: 'bytes32', v: inStateDelta},
      {t: 'bytes32', v: outStateDelta},
      {t: 'bytes', v: ethCall},
    );
    const sig = utils.sign(data.worker[4], proof);
    return new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipt(scAddr, taskId, inStateDelta, outStateDelta, ethCall, sig).
        send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        }).
        on('receipt', (receipt) => resolve(receipt)).
        on('error', (error) => reject(error));
    }).then((result) => {
      expect(result.events.ReceiptVerified).not.to.be.empty;
    });
  });

  it('should get the confirmed task', () => {
    return enigma.getTask(taskId).then((task) => {
      expect(task.status).to.be.equal(1);
    });
  });

  let taskRecords;
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
        taskRecords = [taskRecord1, taskRecord2];

        console.log('creating task records', taskRecords);
        return new Promise((resolve, reject) => {
          enigma.createTaskRecords(taskRecords).
            on('mined', (receipt) => resolve(receipt)).
            on('error', (error) => reject(error));
        });
      }).
      then((results) => {
        for (let i = 0; i < taskRecords.length; i++) {
          expect(results[i].taskId).to.be.equal(taskRecords[i].taskId);
        }
      });
  });

  it('should get the pending tasks', () => {
    let promises = [];
    taskRecords.forEach((taskRecord) => {
      promises.push(enigma.getTask(taskRecord.taskId));
    });
    return Promise.all(promises).then((tasks) => {
      tasks.forEach((task) => {
        expect(task.status).to.be.equal(0);
      });
    });
  });

  it('should simulate multiple task receipts', () => {
    const enigmaContract = enigma.enigmaContract;
    const inStateDelta1 = outStateDelta;
    const outStateDelta1 = web3.utils.soliditySha3('test2');
    const inStateDelta2 = outStateDelta1;
    const outStateDelta2 = web3.utils.soliditySha3('test3');
    const ethCall = web3.utils.soliditySha3('test');
    const taskIds = taskRecords.map((t) => t.taskId);
    const proof1 = web3.utils.soliditySha3(
      {t: 'bytes32', v: taskIds[0]},
      {t: 'bytes32', v: inStateDelta1},
      {t: 'bytes32', v: outStateDelta1},
      {t: 'bytes', v: ethCall},
    );
    const sig1 = utils.sign(data.worker[4], proof1);
    const proof2 = web3.utils.soliditySha3(
      {t: 'bytes32', v: taskIds[1]},
      {t: 'bytes32', v: inStateDelta2},
      {t: 'bytes32', v: outStateDelta2},
      {t: 'bytes', v: ethCall},
    );
    const sig2 = utils.sign(data.worker[4], proof2);
    const inStateDeltas = [inStateDelta1, inStateDelta2];
    const outStateDeltas = [outStateDelta1, outStateDelta2];
    const ethCalls = [ethCall, ethCall];
    const sigs = [sig1, sig2];
    return new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipts(scAddr, taskIds, inStateDeltas, outStateDeltas, ethCalls, sigs).
        send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        }).
        on('receipt', (receipt) => resolve(receipt)).
        on('error', (error) => reject(error));
    }).then((result) => {
      expect(result.events.ReceiptsVerified).not.to.be.empty;
    });
  });

  it('should get the confirmed tasks', () => {
    return enigma.getTask(taskRecords.map((t) => t.taskId)).then((tasks) => {
      tasks.forEach((task) => {
        expect(task.status).to.be.equal(1);
      });
    });
  });

  it('should encrypt task inputs', () => {
    todo();
  });

  it('should get the selected workers for the contract / epoch', () => {
    todo();
  });

  it('should send task inputs to the network', () => {
    todo();
  });

  it('should poll the network for unconfirmed task', () => {
    todo();
  });

  it('should poll the network for confirmed task', () => {
    todo();
  });
});
