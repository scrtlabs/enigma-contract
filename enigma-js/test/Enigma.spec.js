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
      const report = '0x' + Array.from(worker[1]).map(c => c.charCodeAt(0).toString(16)).join('');
      const signature = worker[3];
      // Using the same artificial data for all workers
      let promise = new Promise((resolve, reject) => {
        enigmaContract.methods.register(worker[0], report, signature)
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
        enigma.admin.login({from: accounts[i]})
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
    await enigma.admin.logout({from: accounts[0]});
    let workerStatus = await enigma.admin.getWorkerStatus(accounts[0]);
    expect(workerStatus).toEqual(3);
    await enigma.admin.login({from: accounts[0]});
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
          console.log("errored");
          reject(error);
        });
    });
    expect(receipt).toBeTruthy;
  });

  let scAddr;
  let codeHash;
  it('should deploy contract', async () => {
    // Pre-deployed bytecode hash
    codeHash = web3.utils.soliditySha3('9d075ae');
    let account = accounts[0];
    let inputs = ['first_sc', 1];
    const receipt = await new Promise((resolve, reject) => {
      enigma.deploySecretContract(codeHash, account, inputs)
        .on(eeConstants.DEPLOY_SC_ADDR_RESULT, (result) => {
          scAddr = result;
        })
        .on(eeConstants.DEPLOY_SC_ETH_RECEIPT, (receipt) => {
        })
        .on(eeConstants.DEPLOY_SC_ENG_RECEIPT, (receipt) => {
          resolve(receipt);
        });
    });
    expect(receipt.deploySentResult).toEqual(true);
  });

  it('should verify deployed contract', async () => {
    const result = await enigma.admin.isDeployed(scAddr);
    expect(result).toEqual(true);
  });

  it('should get contract bytecode hash', async () => {
    const result = await enigma.admin.getCodeHash(scAddr);
    expect(result).toEqual(codeHash);
  });

  const fn = 'medianWealth(int32,int32)';
  const args = [200000, 300000];
  const userPubKey = '5587fbc96b01bfe6482bf9361a08e84810afcc0b1af72a8e4520f9' +
       '8771ea1080681e8a2f9546e5924e18c047fa948591dba098bffaced50f97a41b0050bdab99';
  const fee = utils.toGrains(300);
  let taskInput;
  it('should create TaskInput', async () => {
    taskInput = await new Promise((resolve, reject) => {
      enigma.createTaskInput(fn, args, scAddr, accounts[0], userPubKey, fee)
        .on(eeConstants.CREATE_TASK_INPUT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(taskInput).toBeTruthy;
    expect(taskInput.sender).toEqual(accounts[0]);
    expect(taskInput.scAddr).toEqual(scAddr);
    expect(taskInput.userPubKey).toEqual(userPubKey);
    const msg = web3.utils.soliditySha3(
        {t: 'bytes', v: taskInput.encryptedFn},
        {t: 'bytes', v: taskInput.encryptedEncodedArgs},
      );
    expect(enigma.web3.eth.accounts.recover(msg, taskInput.userTaskSig)).toEqual(accounts[0]);
    expect(taskInput.fee).toEqual(fee);
  });

  let taskRecord;
  it('should create task record', async () => {
    const tokenContract = enigma.tokenContract;
    const enigmaContract = enigma.enigmaContract;
    const startingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    taskRecord = await new Promise((resolve, reject) => {
      enigma.createTaskRecord(taskInput)
        .on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    const endingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    expect(taskRecord.receipt).toBeTruthy;
    expect(taskRecord.taskId).toEqual(taskInput.taskId);
    expect(taskRecord.fee).toEqual(fee);
    expect(taskRecord.transactionHash).toBeTruthy;
    expect(taskRecord.receipt).toBeTruthy;
    expect(taskRecord.status).toEqual(1);
    expect(taskRecord.proof).toBeFalsy;
    expect(endingBalance-startingBalance).toEqual(fee);
  });

  it('should fail to create task record due to insufficient funds', async () => {
    const taskInput2 = await new Promise((resolve, reject) => {
      enigma.createTaskInput(fn, args, scAddr, accounts[9], userPubKey, fee)
        .on(eeConstants.CREATE_TASK_INPUT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    await expect(new Promise((resolve, reject) => {
      enigma.createTaskRecord(taskInput2)
        .on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    })).rejects.toEqual({"message": "Not enough tokens to pay the fee", "name": "NotEnoughTokens"});

  })

  it('should get the pending task', async () => {
    taskRecord = await enigma.getTaskRecordStatus(taskRecord);
    expect(taskRecord.status).toEqual(1);
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
    const startingBalance = (await enigma.enigmaContract.methods.workers(accounts[0]).call()).balance;
    const result = await new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipt(scAddr, taskRecord.taskId, inStateDelta, outStateDelta, ethCall, sig)
        .send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    });
    const endingBalance = (await enigma.enigmaContract.methods.workers(accounts[0]).call()).balance;
    expect(endingBalance - startingBalance).toEqual(fee);
    expect(result.events.ReceiptVerified).toBeTruthy;
  });

  it('should get the confirmed task', async () => {
    taskRecord = await enigma.getTaskRecordStatus(taskRecord);
    expect(taskRecord.status).toEqual(2);
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

  let taskRecords;
  it('should create multiple task records', async () => {
    const argsA = [200000, 300000];
    const argsB = [300000, 400000];

    const tokenContract = enigma.tokenContract;
    const enigmaContract = enigma.enigmaContract;
    const startingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    let taskInputA = await new Promise((resolve, reject) => {
      enigma.createTaskInput(fn, argsA, scAddr, accounts[0], userPubKey, fee)
        .on(eeConstants.CREATE_TASK_INPUT, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    let taskInputB = await new Promise((resolve, reject) => {
      enigma.createTaskInput(fn, argsB, scAddr, accounts[0], userPubKey, fee)
        .on(eeConstants.CREATE_TASK_INPUT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    taskRecords = await new Promise((resolve, reject) => {
      enigma.createTaskRecords([taskInputA, taskInputB])
        .on(eeConstants.CREATE_TASK_RECORDS, (result) => resolve(result))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    const endingBalance = await tokenContract.methods.balanceOf(enigmaContract.options.address).call();
    for (let i = 0; i < taskRecords.length; i++) {
      expect(taskRecords[i].receipt).toBeTruthy;
    }
    expect(endingBalance-startingBalance).toEqual(fee*2);
  });

  it('should get the pending tasks', async () => {
    for (let tRecord of taskRecords) {
      tRecord = await enigma.getTaskRecordStatus(tRecord);
      expect(tRecord.status).toEqual(1);
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
    const startingBalance = (await enigma.enigmaContract.methods.workers(accounts[0]).call()).balance;
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
    const endingBalance = (await enigma.enigmaContract.methods.workers(accounts[0]).call()).balance;
    expect(endingBalance - startingBalance).toEqual(fee*2);
    expect(result.events.ReceiptsVerified).toBeTruthy;
  });

  it('should get the confirmed tasks', async () => {
    for (let tRecord of taskRecords) {
      tRecord = await enigma.getTaskRecordStatus(tRecord);
      expect(tRecord.status).toEqual(2);
    }
  });

  it('should get state delta hash range', async () => {
    const hashes = await enigma.admin.getStateDeltaHashes(scAddr, 0, 3);
    expect(hashes).toEqual([outStateDelta, outStateDeltas[0], outStateDeltas[1]]);
  });

  let params;
  it('should get the worker parameters for the current block', async () => {
    const blockNumber = await web3.eth.getBlockNumber();
    const workerParams = await enigma.getWorkerParams(blockNumber);
    expect(workerParams).toBeTruthy;
  });

  it('should get the selected workers for the contract / epoch', async () => {
    const enigmaContract = enigma.enigmaContract;
    const blockNumber = await web3.eth.getBlockNumber();
    const contractSelectWorkers = await enigmaContract.methods.getWorkerGroup(blockNumber, scAddr).call();
    const workerParams = await enigma.getWorkerParams(blockNumber);
    const group = await enigma.selectWorkerGroup(blockNumber, scAddr, workerParams, 5);
    for (let i = 0; i < group.length; i++) {
      expect(group[i]).toEqual(contractSelectWorkers[i]);
    }
  });

  it('should send task input to the network', async () => {
    const result = await new Promise((resolve, reject) => {
      enigma.sendTaskInput(taskInput)
        .on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(result.sendTaskResult).toEqual(true);
  });

  it('should fail to send corrupted task input to the network', async () => {
    let corruptedTaskInput = taskInput;
    corruptedTaskInput.sender = '';
    await expect(new Promise((resolve, reject) => {
        enigma.sendTaskInput(corruptedTaskInput)
          .on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt))
          .on(eeConstants.ERROR, (error) => reject(error));
    })).rejects.toEqual({"code": -32602,"message": "Invalid params"});
  });

  it('should poll the network until task confirmed', async () => {
    let taskInputResults = [];
    const result = await new Promise((resolve, reject) => {
      enigma.pollTaskInput(taskInput)
        .on(eeConstants.POLL_TASK_INPUT_RESULT, (receipt) => {
          taskInputResults.push(receipt.status);
          if (receipt.status === 2) {
            resolve(receipt);
          }
        })
        .on(eeConstants.ERROR, (error) => reject(error));
    });
    expect(taskInputResults).toEqual([ 1, 1, 1, 1, 2 ]);
  });

  it('should verify the report', async () => {
    let worker = data.worker;

    let report = '0x' + Array.from(worker[1]).map(c => c.charCodeAt(0).toString(16)).join('');
    let signature = worker[3];
    console.log("report: " + report);
    console.log('sig: ' + signature);
    const result = await enigma.enigmaContract.methods.verifyReport(report, signature).call();
    
    expect(result).toEqual("0");
  }, 40000);
  

  it('should fail the RPC Server', async () => {
    expect.assertions(14);
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('getWorkerEncryptionKey', {}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('deploySecretContract', {}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('deploySecretContract', {compiledBytecodeHash: '0x1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('deploySecretContract', {compiledBytecodeHash: '0x1', encryptedEncodedArgs: '1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: "Invalid params"});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1',
        encryptedFn: '1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1',
        encryptedFn: '1', encryptedEncodedArgs: '1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1',
        encryptedFn: '1', encryptedEncodedArgs: '1', userTaskSig: '1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInput', {taskId: '1', creationBlockNumber: 1, sender: '0x1', scAddr: '0x1',
        encryptedFn: '1', encryptedEncodedArgs: '1', userTaskSig: '1', userPubKey: '0x1'}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    await expect(new Promise((resolve, reject) => {
      enigma.client.request('pollTaskInput', {}, (err, response) => {
        if (err) reject (err)
        resolve(response);
      });
    })).rejects.toEqual({code: -32602, message: 'Invalid params'});
  });
});
