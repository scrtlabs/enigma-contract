/* eslint-disable require-jsdoc */
import chai from 'chai';
import Enigma from '../src/Enigma';
import utils from '../src/enigma-utils';
import forge from 'node-forge';
import { fromRpcSig, ecRecover } from 'ethereumjs-util';
import Web3 from 'web3';
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import data from './data';
import * as eeConstants from '../src/emitterConstants'

// Launch local mock JSON RPC Server
//require('../src/Server.js');
import RPCServer from '../src/Server';

forge.options.usePureJavaScript = true;

function todo() {
  throw new Error('not implemented');
};

describe('Enigma tests', () => {

  let server;

  beforeAll(() => {
    server = new RPCServer();
    server.listen();
  });

  afterAll(done => {
    server.close(done);
  });


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
        'http://localhost:3000',
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
    const {publicKey, privateKey} = enigma.obtainTaskKeyPair();
    expect(privateKey).toEqual('1737611edbedec5546e1457769f900b8d7daef442d966e60949decd63f9dd86f');
    expect(publicKey).toEqual('2ea8e4cefb78efd0725ed12b23b05079a0a433cc8a656f212accf58672fee44a20cfcaa50466237273e762e49ec912be61358d5e90bff56a53a0ed42abfe27e3');
  });

  it('should distribute ENG tokens', async () => {
    const tokenContract = enigma.tokenContract;
    let promises = [];
    const allowance = utils.toGrains(1000);
    for (let i = 1; i < accounts.length - 1; i++) {
      let promise = new Promise(async (resolve, reject) => {
        const approveResult = await tokenContract.methods.approve(accounts[i], allowance).send(enigma.txDefaults);
        const transferResult = await tokenContract.methods.transfer(accounts[i], allowance).send(enigma.txDefaults);
        resolve(transferResult);
      });
      promises.push(promise);
    }
    const results = await Promise.all(promises);
    expect(results.length).toEqual(accounts.length - 2);
  });

  it('should simulate worker registration', async () => {
    const enigmaContract = enigma.enigmaContract;
    let promises = [];
    for (let i = 0; i < accounts.length-1; i++) {
      let worker = (i === 8) ? data.principal : data.worker;
      if (i === 8) {
        console.log('setting principal node', worker[0]);
      }
      const report = utils.encodeReport(
        worker[1],
        worker[2],
        worker[3],
      );
      // Using the same artificial data for all workers
      let promise = new Promise((resolve, reject) => {
        enigmaContract.methods.register(worker[0], report)
          .send({
            gas: 4712388,
            gasPrice: 100000000000,
            from: accounts[i],
          })
          .on('receipt', (receipt) => resolve(receipt))
          .on('error', (error) => reject(error));
      });
      promises.push(promise);
    }
    // Using the account as the signer for testing purposes
    const registerWorkersResults = await Promise.all(promises);
    expect(registerWorkersResults.length).toEqual(9);
  });

  it('should get the worker report', async () => {
    const report = await enigma.getReport(accounts[0]);
    expect(report).toBeTruthy;
  });

  it('should check workers have been logged in', async () => {
    let workerStatuses = [];
    for (let i = 0; i < accounts.length-2; i++) {
      workerStatuses.push(await enigma.admin.getWorkerStatus(accounts[i]));
    }
    for (let workerStatus of workerStatuses) {
      expect(workerStatus).toEqual(1);
    }
  });

  it('should check workers stake balance is empty', async () => {
    let balances = [];
    for (let i = 0; i < accounts.length-1; i++) {
      if (i === 8) {
        continue;
      }
      balances.push(await enigma.admin.getStakedBalance(accounts[i]));
    }
    expect(balances).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('should fail to deposit too large a token amount', async () => {
    await expect(new Promise((resolve, reject) => {
      enigma.admin.deposit(accounts[1], utils.toGrains(2000))
        .on('depositReceipt', (result) => resolve(result))
        .on('error', (err) => {
          reject(err);
        });
    })).rejects.toEqual({message: 'Not enough tokens in wallet', name: 'NotEnoughTokens'});
  });

  it('should deposit tokens in worker banks', async () => {
    const deposits = [900, 100, 10, 20, 100, 200, 40, 100];
    let promises = [];
    for (let i = 0; i < accounts.length - 1; i++) {
      if (i === 8) {
        continue;
      }
      let promise = new Promise((resolve, reject) => {
        enigma.admin.deposit(accounts[i], utils.toGrains(deposits[i]))
          .on('depositReceipt', (result) => resolve(result))
          .on('error', (err) => {
            reject(err);
          });
      });
      promises.push(promise);
    }
    const results = await Promise.all(promises);
    expect(results.length).toEqual(8);
  });

  it('should check workers stake balance has been filled', async () => {
    let balances = [];
    for (let i = 0; i < accounts.length - 1; i++) {
      if (i === 8) {
        continue;
      }
      balances.push(await enigma.admin.getStakedBalance(accounts[i]));
    }
    expect(balances).toEqual([900, 100, 10, 20, 100, 200, 40, 100].map((balance) => balance * 10 ** 8));
  });

  it('should login all the workers', async () => {
    let promises = [];
    for (let i = 0; i < accounts.length - 1; i++) {
      let promise = new Promise((resolve, reject) => {
        enigma.admin.login(accounts[i])
          .on(eeConstants.LOGIN_RECEIPT, (result) => {
            resolve(result);
          });
      });
      promises.push(promise);
    }
    const loginReceipts = await Promise.all(promises);
    expect(loginReceipts.length).toEqual(9);
  });

  it('should check workers have been logged in', async () => {
    let workerStatuses = [];
    for (let i = 0; i < accounts.length-2; i++) {
      workerStatuses.push(await enigma.admin.getWorkerStatus(accounts[i]));
    }
    for (let workerStatus of workerStatuses) {
      expect(workerStatus).toEqual(2);
    }
  });

  it('should logout and log back in a worker', async () => {
    await enigma.admin.logout(accounts[0]);
    let workerStatus = await enigma.admin.getWorkerStatus(accounts[0]);
    expect(workerStatus).toEqual(3);
    await enigma.admin.login(accounts[0]);
    workerStatus = await enigma.admin.getWorkerStatus(accounts[0]);
    expect(workerStatus).toEqual(2);
  });

  it('should set the worker parameters (principal only)', async () => {
    const enigmaContract = enigma.enigmaContract;
    const seed = Math.floor(Math.random() * 100000);
    const hash = web3.utils.soliditySha3({t: 'uint256', v: seed});
    const sig = utils.sign(data.principal[4], hash);

    const receipt = await new Promise((resolve, reject) => {
      enigmaContract.methods.setWorkersParams(seed, sig)
        .send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[8],
        })
        .on('receipt', (receipt) => resolve(receipt))
        .on('error', (error) => {
          console.log('errored');
          reject(error);
        });
    });
    expect(receipt).toBeTruthy;
  });

  let scTask;
  let preCodeHash;
  it('should create deploy contract Task', async () => {
    // Pre-deployed bytecode hash
    preCodeHash = web3.utils.soliditySha3('9d075ae');
    let scTaskFn = 'deployContract';
    let scTaskArgs = [
      [preCodeHash, 'bytes32'],
      ['first_sc', 'string'],
      [1, 'uint'],
    ];
    let scTaskFee = utils.toGrains(300);
    scTask = enigma.createTask(scTaskFn, scTaskArgs, scTaskFee, accounts[0]);
    expect(scTask).toBeTruthy;
    expect(scTask.taskIdInputHash).toEqual('0x2dd52ee2bfd5c5b696f3e879f5fc14a7287d1d566e5bb6b0299dd3920dbf62e2');
    expect(scTask.fn).toEqual('deployContract');
    expect(scTask.abiEncodedArgs).toEqual('0xd8bba960831bacafe85a45f6e29d3d3cb7f61180cce79dc41d47ab6a18e195dc0000' +
      '0000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000' +
      '000000000000000001000000000000000000000000000000000000000000000000000000000000000866697273745f736300000000' +
      '0000000000000000000000000000000000000000');
    expect(scTask.fee).toEqual(30000000000);
    expect(scTask.userPubKey).toEqual('2ea8e4cefb78efd0725ed12b23b05079a0a433cc8a656f212accf58672fee44a20cfcaa504' +
      '66237273e762e49ec912be61358d5e90bff56a53a0ed42abfe27e3');
    expect(scTask.sender).toEqual('0xC20219b20723a39E58897b861051f94A410f5ec2');
  });

  it('should fail to create task record due to insufficient funds', async () => {
    let corruptedTask = {...scTask, sender: accounts[9]};
    await expect(new Promise((resolve, reject) => {
      enigma.createTaskRecord(corruptedTask)
        .on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    })).rejects.toEqual({message: 'Not enough tokens to pay the fee', name: 'NotEnoughTokens'});
  });

  it('should create deploy contract Task record', async () => {
    const tokenContract = enigma.tokenContract;
    const enigmaContract = enigma.enigmaContract;
    const startingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    scTask = await new Promise((resolve, reject) => {
      enigma.createTaskRecord(scTask)
        .on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    const endingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    expect(scTask.receipt).toBeTruthy;
    expect(scTask.transactionHash).toBeTruthy;
    expect(scTask.taskId).toEqual('0x345ec1f65c347bff9cd54054bbce5f2cd2a45d277c2b4b82c323ef3078ce11e9');
    expect(scTask.ethStatus).toEqual(1);
    expect(scTask.proof).toBeFalsy;
    expect(endingBalance-startingBalance).toEqual(scTask.fee);
  });

  it('should create deploy contract Task for Enigma Network', async () => {
    scTask = await new Promise((resolve, reject) => {
      enigma.createTaskInput(scTask)
        .on(eeConstants.CREATE_TASK_INPUT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(scTask.sender).toEqual(accounts[0]);
    const msg = web3.utils.soliditySha3(
        {t: 'bytes', v: scTask.encryptedFn},
        {t: 'bytes', v: scTask.encryptedAbiEncodedArgs},
      );
    expect(enigma.web3.eth.accounts.recover(msg, scTask.userTaskSig)).toEqual(accounts[0]);
  });

  it('should get the worker parameters for the current block', async () => {
    const blockNumber = await web3.eth.getBlockNumber();
    const workerParams = await enigma.getWorkerParams(blockNumber);
    expect(workerParams).toBeTruthy;
  });

  it('should get the selected workers for the contract / epoch', async () => {
    const enigmaContract = enigma.enigmaContract;
    const contractSelectWorkers = await enigmaContract.methods.getWorkerGroup(scTask.creationBlockNumber,
      scTask.taskId).call();
    const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    const group = await enigma.selectWorkerGroup(scTask.creationBlockNumber, scTask.taskId, workerParams, 5);
    for (let i = 0; i < group.length; i++) {
      expect(group[i]).toEqual(contractSelectWorkers[i]);
    }
  });

  it('should fail to send corrupted task input to the network', async () => {
    let corruptedTask = {...scTask, sender: ''};
    await expect(new Promise((resolve, reject) => {
      enigma.sendTaskInput(corruptedTask)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
  });

  it('should send deploy contract Task to Enigma Network', async () => {
    const result = await new Promise((resolve, reject) => {
      enigma.sendTaskInput(scTask)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(result.sendTaskResult).toEqual(true);
  });

  it('should get the pending deploy contract Task', async () => {
    scTask = await enigma.getTaskRecordStatus(scTask);
    expect(scTask.ethStatus).toEqual(1);
  });

  let codeHash;
  it('should simulate the contract deployment', async () => {
    const enigmaContract = enigma.enigmaContract;
    codeHash = web3.utils.soliditySha3('1a2b3c4d');
    const proof = web3.utils.soliditySha3(
      {t: 'bytes32', v: scTask.taskId},
      {t: 'bytes32', v: codeHash},
    );
    const sig = utils.sign(data.worker[4], proof);
    const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.creationBlockNumber, scTask.taskId,
      workerParams, 5))[0];
    const startingBalance = (await enigma.enigmaContract.methods.workers(selectedWorkerAddr).call()).balance;
    const result = await new Promise((resolve, reject) => {
      enigmaContract.methods.deploySecretContract(scTask.taskId, preCodeHash, codeHash, scTask.sender, sig)
        .send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: selectedWorkerAddr,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    });
    const endingBalance = (await enigma.enigmaContract.methods.workers(selectedWorkerAddr).call()).balance;
    expect(endingBalance - startingBalance).toEqual(scTask.fee);
    expect(result.events.SecretContractDeployed).toBeTruthy;
  });

  it('should get the confirmed deploy contract Task', async () => {
    scTask = await enigma.getTaskRecordStatus(scTask);
    expect(scTask.ethStatus).toEqual(2);
  });

  it('should verify deployed contract', async () => {
    const result = await enigma.admin.isDeployed(scTask.taskId);
    expect(result).toEqual(true);
  });

  it('should get deployed contract bytecode hash', async () => {
    const result = await enigma.admin.getCodeHash(scTask.taskId);
    expect(result).toEqual(codeHash);
  });

  let scAddr;
  let task;
  it('should create Task', async () => {
    scAddr = scTask.taskId;
    let taskFn = 'medianWealth';
    let taskArgs = [
      [200000, 'int32'],
      [300000, 'int32'],
    ];
    let taskFee = utils.toGrains(300);
    task = enigma.createTask(taskFn, taskArgs, taskFee, accounts[0], scAddr);
    expect(task).toBeTruthy;
    expect(task.taskIdInputHash).toEqual('0xbe2897c379b3f57dd826042ea1777f29db18434758fe9745838c86acef1e10a4');
    expect(task.fn).toEqual('medianWealth');
    expect(task.abiEncodedArgs).toEqual('0x0000000000000000000000000000000000000000000000000000000000030d40000000' +
      '00000000000000000000000000000000000000000000000000000493e0');
    expect(scTask.fee).toEqual(30000000000);
    expect(scTask.userPubKey).toEqual('2ea8e4cefb78efd0725ed12b23b05079a0a433cc8a656f212accf58672fee44a20cfcaa504' +
      '66237273e762e49ec912be61358d5e90bff56a53a0ed42abfe27e3');
    expect(scTask.sender).toEqual('0xC20219b20723a39E58897b861051f94A410f5ec2');
  });

  it('should create Task record', async () => {
    const tokenContract = enigma.tokenContract;
    const enigmaContract = enigma.enigmaContract;
    const startingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    task = await new Promise((resolve, reject) => {
      enigma.createTaskRecord(task)
        .on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    const endingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    console.log('TASK', task);
    expect(task.receipt).toBeTruthy;
    expect(task.transactionHash).toBeTruthy;
    expect(task.taskId).toEqual('0xdb6642203d5d8be0c24009c5c846a500e963c2fb72b0dec5a4f6bae8a9d6619f');
    expect(task.ethStatus).toEqual(1);
    expect(task.proof).toBeFalsy;
    expect(endingBalance-startingBalance).toEqual(task.fee);
  });

  it('should create Task for Enigma Network', async () => {
    task = await new Promise((resolve, reject) => {
      enigma.createTaskInput(task)
        .on(eeConstants.CREATE_TASK_INPUT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(task.sender).toEqual(accounts[0]);
    const msg = web3.utils.soliditySha3(
      {t: 'bytes', v: task.encryptedFn},
      {t: 'bytes', v: task.encryptedAbiEncodedArgs},
    );
    expect(enigma.web3.eth.accounts.recover(msg, task.userTaskSig)).toEqual(accounts[0]);
  });

  it('should send Task to Enigma Network', async () => {
    const result = await new Promise((resolve, reject) => {
      enigma.sendTaskInput(task)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(result.sendTaskResult).toEqual(true);
  });

  it('should poll the network until task confirmed', async () => {
    let taskStatuses = [];
    await new Promise((resolve, reject) => {
      enigma.pollTaskInput(task)
        .on(eeConstants.POLL_TASK_INPUT_RESULT, (result) => {
          taskStatuses.push(result.engStatus);
          if (result.engStatus === 2) {
            resolve();
          }
        })
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(taskStatuses).toEqual([1, 1, 1, 1, 2]);
  });

  it('should get the pending Task', async () => {
    task = await enigma.getTaskRecordStatus(task);
    expect(task.ethStatus).toEqual(1);
  });

  let outStateDelta;
  it('should simulate the task receipt', async () => {
    const enigmaContract = enigma.enigmaContract;
    const inStateDelta = '0x0000000000000000000000000000000000000000000000000000000000000000';
    outStateDelta = web3.utils.soliditySha3('test');
    const ethCall = web3.utils.soliditySha3('test');
    const proof = web3.utils.soliditySha3(
      {t: 'bytes32', v: task.taskId},
      {t: 'bytes32', v: inStateDelta},
      {t: 'bytes32', v: outStateDelta},
      {t: 'bytes', v: ethCall},
    );
    const sig = utils.sign(data.worker[4], proof);
    const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.creationBlockNumber, scTask.taskId,
      workerParams, 5))[0];
    const startingBalance = (await enigma.enigmaContract.methods.workers(selectedWorkerAddr).call()).balance;
    const result = await new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipt(scAddr, task.taskId, inStateDelta, outStateDelta, ethCall, sig)
        .send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: selectedWorkerAddr,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    });
    const endingBalance = (await enigma.enigmaContract.methods.workers(selectedWorkerAddr).call()).balance;
    expect(endingBalance - startingBalance).toEqual(task.fee);
    expect(result.events.ReceiptVerified).toBeTruthy;
  });

  it('should get the confirmed Task', async () => {
    task = await enigma.getTaskRecordStatus(task);
    expect(task.ethStatus).toEqual(2);
  });


  it('should count state deltas', async () => {
    const count = await enigma.admin.countStateDeltas(scAddr);
    expect(count).toEqual(1);
  });

  let stateDeltaHash;
  it('should get state delta hash', async () => {
    const delta = await enigma.admin.getStateDeltaHash(scAddr, 0);
    stateDeltaHash = delta;
    expect(delta).toBeTruthy;
  });

  it('should verify state delta', async () => {
    const isValid = await enigma.admin.isValidDeltaHash(scAddr, stateDeltaHash);
    expect(isValid).toEqual(true);
  });

  let tasks;
  it('should create multiple task records', async () => {
    const tokenContract = enigma.tokenContract;
    const enigmaContract = enigma.enigmaContract;
    let taskFn = 'medianWealth';
    let taskFee = utils.toGrains(300);
    let taskArgsA = [
      [200000, 'int32'],
      [300000, 'int32'],
    ];
    let taskArgsB = [
      [1000000, 'int32'],
      [2000000, 'int32'],
    ];
    let taskA = enigma.createTask(taskFn, taskArgsA, taskFee, accounts[0], scAddr);
    let taskB = enigma.createTask(taskFn, taskArgsB, taskFee, accounts[0], scAddr);
    tasks = [taskA, taskB];
    const startingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    tasks = await new Promise((resolve, reject) => {
      enigma.createTaskRecords(tasks)
        .on(eeConstants.CREATE_TASK_RECORDS, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    const endingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    for (let i = 0; i < tasks.length; i++) {
      expect(tasks[i].receipt).toBeTruthy;
    }
    expect(endingBalance-startingBalance).toEqual(tasks[0].fee + tasks[1].fee);
  });

  it('should get the pending Tasks', async () => {
    for (let i = 0; i < tasks.length; i++) {
      tasks[i] = await enigma.getTaskRecordStatus(tasks[i]);
      expect(tasks[i].ethStatus).toEqual(1);
    }
  });

  let outStateDeltas;
  it('should simulate multiple task receipts', async () => {
    const enigmaContract = enigma.enigmaContract;
    const inStateDelta1 = outStateDelta;
    const outStateDelta1 = web3.utils.soliditySha3('test2');
    const inStateDelta2 = outStateDelta1;
    const outStateDelta2 = web3.utils.soliditySha3('test3');
    const ethCall = web3.utils.soliditySha3('test');
    const taskIds = tasks.map((task) => task.taskId);
    const proof = web3.utils.soliditySha3(
      {t: 'bytes32', v: taskIds[0]},
      {t: 'bytes32', v: taskIds[1]},
      {t: 'bytes32', v: inStateDelta1},
      {t: 'bytes32', v: inStateDelta2},
      {t: 'bytes32', v: outStateDelta1},
      {t: 'bytes32', v: outStateDelta2},
      {t: 'bytes', v: ethCall},
    );
    const sig = utils.sign(data.worker[4], proof);
    const inStateDeltas = [inStateDelta1, inStateDelta2];
    outStateDeltas = [outStateDelta1, outStateDelta2];
    const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.creationBlockNumber, scTask.taskId,
      workerParams, 5))[0];
    const startingBalance = (await enigma.enigmaContract.methods.workers(selectedWorkerAddr).call()).balance;
    const result = await new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipts(scAddr, taskIds, inStateDeltas, outStateDeltas, ethCall, sig)
        .send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: selectedWorkerAddr,
        })
        .on('receipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    });
    const endingBalance = (await enigma.enigmaContract.methods.workers(selectedWorkerAddr).call()).balance;
    expect(endingBalance - startingBalance).toEqual(tasks[0].fee + tasks[1].fee);
    expect(result.events.ReceiptsVerified).toBeTruthy;
  });

  it('should get the confirmed Tasks', async () => {
    for (let i = 0; i < tasks.length; i++) {
      tasks[i] = await enigma.getTaskRecordStatus(tasks[i]);
      expect(tasks[i].ethStatus).toEqual(2);
    }
  });

  it('should get state delta hash range', async () => {
    const hashes = await enigma.admin.getStateDeltaHashes(scAddr, 0, 3);
    expect(hashes).toEqual([outStateDelta, outStateDeltas[0], outStateDeltas[1]]);
  });

  it('should fail the RPC Server', async () => {
    expect.assertions(11);
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('getWorkerEncryptionKey', {}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1'}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1'}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: "Invalid params"});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1'}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1',
        encryptedFn: '1'}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1',
        encryptedFn: '1', encryptedEncodedArgs: '1'}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1',
        encryptedFn: '1', encryptedEncodedArgs: '1', userTaskSig: '1'}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1',
        encryptedFn: '1', encryptedEncodedArgs: '1', userTaskSig: '1', userPubKey: '0x1'}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('pollTaskInput', {}, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
  });
});
