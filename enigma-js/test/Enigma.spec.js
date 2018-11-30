/* eslint-disable require-jsdoc */
import chai from 'chai';
import {Enigma, utils} from '../lib/enigma-js';
import forge from 'node-forge';
import Web3 from 'web3';
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import data from './data';
import TaskInput from "../src/models/TaskInput";
import TaskRecord from "../src/models/TaskRecord";

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
        {
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        },
      );
      enigma.admin();
      expect(enigma.version()).to.equal('0.0.1');
    });
  });

  it('should distribute ENG tokens', async () => {
    const tokenContract = enigma.tokenContract;
    let promises = [];
    const allowance = utils.toGrains(1000);
    for (let i = 1; i < accounts.length; i++) {
      let promise = new Promise(async (resolve, reject) => {
        const approveResult = await tokenContract.methods.approve(accounts[i], allowance).send(enigma.txDefaults);
        const transferResult = await tokenContract.methods.transfer(accounts[i], allowance).send(enigma.txDefaults);
        resolve(transferResult);
      });
      promises.push(promise);
    }
    const results = await Promise.all(promises);
    console.log('Distribution results', results);
    expect(results.length).to.equal(accounts.length - 1);
  });

  it('should simulate worker registration', async () => {
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
    const registerWorkersResults = await Promise.all(promises);
    expect(registerWorkersResults.length).to.equal(10);
  });

  it('should get the worker report', async () => {
    const report = await enigma.getReport(accounts[0]);
    console.log('Worker report', report);
    expect(report).not.to.be.empty;
  });

  it('should check workers have been registered', async () => {
    let promises = [];
    for (let i = 0; i < accounts.length; i++) {
      let promise = new Promise((resolve, reject) => {
        enigma.admin.getWorkerStatus(accounts[0])
          .on('workerStatus', (result) => {
            resolve(result);
          });
      });
      promises.push(promise);
    }
    const workerStatuses = await Promise.all(promises);
    console.log('Worker status results', workerStatuses);
    for (let workerStatus of workerStatuses) {
      expect(workerStatus).to.equal(1);
    }
  });

  it('should deposit tokens in worker banks', async () => {
    const deposits = [900, 100, 10, 20, 100, 200, 40, 100, 50];
    let promises = [];
    for (let i = 0; i < accounts.length; i++) {
      if (i === 9) {
        continue;
      }
      let promise = await new Promise((resolve, reject) => {
        enigma.admin.deposit(accounts[i], utils.toGrains(deposits[i])).
          on('depositReceipt', (result) => resolve(result)).
          on('error', (err) => {
            reject(err);
          });
      });
      promises.push(promise);
    }
    const results = await Promise.all(promises);
    console.log('results', results);
    expect(results.length).to.equal(9);
  });

  it('should login all the workers', async () => {
    let promises = [];
    for (let i = 0; i < accounts.length; i++) {
      let promise = new Promise((resolve, reject) => {
        enigma.admin.login({from: accounts[i]})
          .on('loginReceipt', (result) => {
            resolve(result);
          });
      });
      promises.push(promise);
    }
    const loginReceipts = await Promise.all(promises);
    expect(loginReceipts.length).to.equal(10);
  });

  it('should check workers have been logged in', async () => {
    let promises = [];
    for (let i = 0; i < accounts.length-1; i++) {
      let promise = new Promise((resolve, reject) => {
        enigma.admin.getWorkerStatus(accounts[0])
          .on('workerStatus', (result) => {
            resolve(result);
          });
      });
      promises.push(promise);
    }
    const workerStatuses = await Promise.all(promises);
    for (let workerStatus of workerStatuses) {
      expect(workerStatus).to.equal(2);
    }
  });

  it('should set the worker parameters (principal only)', async () => {
    const enigmaContract = enigma.enigmaContract;
    const seed = Math.floor(Math.random() * 100000);
    const hash = web3.utils.soliditySha3({t: 'uint256', v: seed});
    const sig = utils.sign(data.principal[4], hash);

    const receipt = await new Promise((resolve, reject) => {
      enigmaContract.methods.setWorkersParams(seed, sig).
        send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[9],
        }).
        on('receipt', (receipt) => resolve(receipt)).
        on('error', (error) => {
          console.log("errored");
          reject(error);
        });
    });
    console.log('Set worker params receipt', receipt);
    expect(receipt).not.to.be.empty;
  });

  let scAddr;
  let codeHash;
  it('should deploy contract', async () => {
    // Pre-deployed bytecode hash
    codeHash = web3.utils.soliditySha3('9d075ae');
    const proof = web3.utils.soliditySha3(
      {t: 'bytes', v: codeHash},
    );
    let account = accounts[0];
    let inputs = ['first_sc', 1];
    const sig = utils.sign(data.worker[4], proof);
    const result = await new Promise((resolve, reject) => {
      enigma.admin.deploySecretContract(codeHash, account, inputs, sig)
        .on('scAddrComputed', (result) => {
          scAddr = result;
        })
        .on('deployETHReceipt', (result) => {
          console.log('ETH deployment complete', result);
        })
        .on('deployENGReceipt', (result) => {
          console.log('ENG deployment complete', result);
          resolve(result);
        });
    });
    expect(result.deploySentResult).to.equal(true);
  });

  it('should verify deployed contract', async () => {
    const result = await enigma.admin.isDeployed(scAddr);
    console.log('Verify deployed contract', result);
    expect(result).to.equal(true);
  });

  it('should get contract bytecode hash', async () => {
    const result = await enigma.admin.getCodeHash(scAddr);
    console.log('Get bytecode hash', result);
    expect(result).to.equal(codeHash);
  });

  const fn = 'medianWealth(int32,int32)';
  const args = [200000, 300000];
  const userPubKey = '04f542371d69af8ebe7c8a00bdc5a9d9f39969406d6c1396037' +
    'ede55515845dda69e42145834e631628c628812d85c805e9da1c56415b32cf99d5ae900f1c1565c';
  const fee = 300;
  let taskInput;
  it('should create TaskInput', async () => {
    taskInput = await new Promise((resolve, reject) => {
      enigma.createTaskInput(fn, args, scAddr, accounts[0], userPubKey, fee)
        .on('createTaskInputReceipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    });
    console.log('Task input', taskInput);
    expect(taskInput).not.to.be.empty;
  });

  let taskRecord;
  it('should create task record', async () => {
    taskRecord = await new Promise((resolve, reject) => {
      enigma.createTaskRecord(taskInput)
        .on('taskRecordReceipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    });
    console.log('Task input', taskInput);
    expect(taskRecord.receipt).not.to.be.empty;
  });

  it('should get the pending task', async () => {
    taskRecord = await enigma.getTaskRecordStatus(taskRecord);
    console.log('Task record,', taskRecord);
    expect(taskRecord.status).to.equal(1);
  });

  let outStateDelta;
  it('should simulate the task receipt', async () => {
    const enigmaContract = enigma.enigmaContract;
    const inStateDelta = '0x0000000000000000000000000000000000000000000000000000000000000000';
    outStateDelta = web3.utils.soliditySha3('test');
    const ethCall = web3.utils.soliditySha3('test');
    const proof = web3.utils.soliditySha3(
      {t: 'bytes32', v: taskRecord.taskId},
      {t: 'bytes32', v: inStateDelta},
      {t: 'bytes32', v: outStateDelta},
      {t: 'bytes', v: ethCall},
    );
    const sig = utils.sign(data.worker[4], proof);
    const result = await new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipt(scAddr, taskRecord.taskId, inStateDelta, outStateDelta, ethCall, sig)
        .send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    });
    console.log(result);
    expect(result.events.ReceiptVerified).not.to.be.empty;
  });

  it('should get the confirmed task', async () => {
    taskRecord = await enigma.getTaskRecordStatus(taskRecord);
    console.log('Task record', taskRecord);
    expect(taskRecord.status).to.equal(2);
  });

  it('should count state deltas', async () => {
    const count = await enigma.admin.countStateDeltas(scAddr);
    expect(count).to.equal(1);
  });

  let stateDeltaHash;
  it('should get state delta hash', async () => {
    const delta = await enigma.admin.getStateDeltaHash(scAddr, 0);
    stateDeltaHash = delta;
    expect(delta).not.to.be.empty;
  });

  it('should verify state delta', async () => {
    const isValid = await enigma.admin.isValidDeltaHash(scAddr, stateDeltaHash);
    expect(isValid).to.equal(true);
  });

  let taskRecords;
  it('should create multiple task records', async () => {
    const argsA = [200000, 300000];
    const argsB = [300000, 400000];

    let taskInputA = await new Promise((resolve, reject) => {
      enigma.createTaskInput(fn, argsA, scAddr, accounts[0], userPubKey, fee)
        .on('createTaskInputReceipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    });
    let taskInputB = await new Promise((resolve, reject) => {
      enigma.createTaskInput(fn, argsB, scAddr, accounts[0], userPubKey, fee)
        .on('createTaskInputReceipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    });
    taskRecords = await new Promise((resolve, reject) => {
      enigma.createTaskRecords([taskInputA, taskInputB])
        .on('taskRecordsReceipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    });
    for (let i = 0; i < taskRecords.length; i++) {
      expect(taskRecords[i].receipt).not.to.be.empty;
    }
  });

  it('should get the pending tasks', () => {
    taskRecords.forEach(async (tRecord) => {
      tRecord = await enigma.getTaskRecordStatus(tRecord);
      expect(tRecord.status).to.equal(1);
    });
  });

  let outStateDeltas;
  it('should simulate multiple task receipts', async () => {
    const enigmaContract = enigma.enigmaContract;
    const inStateDelta1 = outStateDelta;
    const outStateDelta1 = web3.utils.soliditySha3('test2');
    const inStateDelta2 = outStateDelta1;
    const outStateDelta2 = web3.utils.soliditySha3('test3');
    const ethCall = web3.utils.soliditySha3('test');
    const taskIds = taskRecords.map((t) => t.taskId);
    const proof = web3.utils.soliditySha3(
      {t: 'bytes32', v: taskIds[0]},
      {t: 'bytes32', v: inStateDelta1},
      {t: 'bytes32', v: outStateDelta1},
      {t: 'bytes', v: ethCall},
      {t: 'bytes32', v: taskIds[1]},
      {t: 'bytes32', v: inStateDelta2},
      {t: 'bytes32', v: outStateDelta2},
      {t: 'bytes', v: ethCall},
    );
    const sig = utils.sign(data.worker[4], proof);
    const inStateDeltas = [inStateDelta1, inStateDelta2];
    outStateDeltas = [outStateDelta1, outStateDelta2];
    const result = await new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipts(scAddr, taskIds, inStateDeltas, outStateDeltas, ethCall, sig)
        .send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        })
        .on('receipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    });
    expect(result.events.ReceiptsVerified).not.to.be.empty;
  });

  it('should get the confirmed tasks', () => {
    taskRecords.forEach(async (tRecord) => {
      tRecord = await enigma.getTaskRecordStatus(tRecord);
      expect(tRecord.status).to.equal(2);
    });
  });

  it('should get state delta hash range', async () => {
    const hashes = await enigma.admin.getStateDeltaHashes(scAddr, 0, 3);
    expect(hashes).to.deep.equal([outStateDelta, outStateDeltas[0], outStateDeltas[1]]);
  });

  let params;
  it('should get the worker parameters for the current block', async () => {
    const blockNumber = await web3.eth.getBlockNumber();
    console.log('Block number =', blockNumber);
    const workerParams = await enigma.getWorkerParams(blockNumber);
    expect(workerParams).not.to.be.empty;
  });

  it('should get the selected workers for the contract / epoch', async () => {
    const enigmaContract = enigma.enigmaContract;
    const blockNumber = await web3.eth.getBlockNumber();
    const contractSelectWorkers = await enigmaContract.methods.getWorkerGroup(blockNumber, scAddr).call();
    const workerParams = await enigma.getWorkerParams(blockNumber);
    const group = await enigma.selectWorkerGroup(blockNumber, scAddr, workerParams, 5);
    for (let i = 0; i < group.length; i++) {
      expect(group[i]).to.equal(contractSelectWorkers[i]);
    }
  });

  it('should send task input to the network', async () => {
    const result = await new Promise((resolve, reject) => {
      enigma.sendTaskInput(taskInput)
        .on('sendTaskInputReceipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    });
    console.log('Send task input result', result);
    expect(result.sendTaskResult).to.equal(true);
  });

  it('should poll the network for unconfirmed task', () => {
    todo();
    // Request update to TaskResult
  });

  it('should poll the network for confirmed task', () => {
    todo();
  });
});
