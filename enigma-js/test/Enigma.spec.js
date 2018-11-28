/* eslint-disable require-jsdoc */
import chai from 'chai';
import {Enigma, utils} from '../lib/enigma-js';
import forge from 'node-forge';
import Web3 from 'web3';
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import data from './data';
import TaskInput from "../src/models/TaskInput";

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
      enigma.admin();
      expect(enigma.version()).to.equal('0.0.1');
    });
  });

  it('should distribute ENG tokens', () => {
    const tokenContract = enigma.tokenContract;
    let promises = [];
    const allowance = utils.toGrains(1000);
    for (let i = 1; i < accounts.length; i++) {
      let promise = tokenContract.methods.approve(accounts[i], allowance).send(enigma.txDefaults).
        then((result) => {
          console.log('approved tokens', result);
          return tokenContract.methods.transfer(accounts[i], allowance).send(enigma.txDefaults);
        });
      promises.push(promise);
    }
    return Promise.all(promises, (results) => {
      expect(results.length).to.equal(accounts.length - 1);
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
      expect(receipts.length).to.equal(10);
    });
  });

  it('should get the worker report', () => {
    return enigma.getReport(accounts[0]).then((report) => {
      expect(report).not.to.be.empty;
    });
  });

  it('should check workers have been registered', () => {
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
    return Promise.all(promises).then((workerStatuses) => {
      for (let workerStatus of workerStatuses) {
        expect(workerStatus).to.equal("1");
      }
    });
  });

  it('should deposit tokens in worker banks', () => {
    const deposits = [900, 100, 10, 20, 100, 200, 40, 100, 50];
    let promises = [];
    for (let i = 0; i < accounts.length; i++) {
      if (i === 9) {
        continue;
      }
      let promise = new Promise((resolve, reject) => {
        enigma.admin.deposit(accounts[i], utils.toGrains(deposits[i])).
          on('depositReceipt', (result) => resolve(result)).
          on('error', (err) => {
            reject(err);
          });
      });
      promises.push(promise);
    }
    return Promise.all(promises).then((results) => {
      expect(results.length).to.equal(9);
    }).catch((err) => {
      console.error(err);
    });
  });

  it('should login all the workers', () => {
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
    return Promise.all(promises).then((loginReceipts) => {
      expect(loginReceipts.length).to.equal(10);
    });
  });

  it('should check workers have been logged in', () => {
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
    return Promise.all(promises).then((workerStatuses) => {
      for (let workerStatus of workerStatuses) {
        expect(workerStatus).to.equal('2');
      }
    });
  });

  it('should set the worker parameters (principal only)', () => {
    const enigmaContract = enigma.enigmaContract;
    const seed = Math.floor(Math.random() * 100000);
    const hash = web3.utils.soliditySha3({t: 'uint256', v: seed});
    const sig = utils.sign(data.principal[4], hash);

    return new Promise((resolve, reject) => {
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
    }).then((receipt) => {
      expect(receipt).not.to.be.empty;
    });
  });

  let scAddr; // = '0x9d075ae44d859191c121d7522da0cc3b104b8837';
  let codeHash;
  it('should deploy contract', () => {
    // Pre-deployed bytecode hash
    codeHash = web3.utils.soliditySha3('9d075ae');
    const proof = web3.utils.soliditySha3(
      {t: 'bytes', v: codeHash},
    );
    let account = accounts[0];
    scAddr = '0x' + web3.utils.soliditySha3(
      {t: 'bytes32', v: codeHash},
      {t: 'address', v: account},
      {t: 'uint', v: 0},
    ).slice(-40);
    console.log(`Deploying secret contract at address ${scAddr}`);
    let inputs = ['first_sc', 1];
    const sig = utils.sign(data.worker[4], proof);
    return new Promise((resolve, reject) => {
      enigma.admin.deploySecretContract(scAddr, codeHash, account, inputs, sig)
        .on('deployETHReceipt', (result) => {
          console.log('ETH deployment complete', result);
        })
        .on('deployENGReceipt', (result) => {
          console.log('ENG deployment complete', result);
          resolve(result);
        })
    }).then((result) => {
      expect(result[0]).to.equal('successfully deployed');
    });
  });

  it('should verify deployed contract', () => {
    return enigma.admin.isDeployed(scAddr).then((result) => {
      expect(result).to.equal(true);
    });
  });

  it('should get contract bytecode hash', () => {
    return enigma.admin.getCodeHash(scAddr).then((result) => {
      expect(result).to.equal(codeHash);
    });
  });

  const fn = 'medianWealth(int32,int32)';
  const args1 = [200000, 300000];
  const userPubKey = '04f542371d69af8ebe7c8a00bdc5a9d9f39969406d6c1396037' +
    'ede55515845dda69e42145834e631628c628812d85c805e9da1c56415b32cf99d5ae900f1c1565c';
  const fee = 300;
  let taskInput1;
  it('should create TaskInput', () => {
    return new Promise((resolve, reject) => {
      enigma.createTaskInput(fn, args1, scAddr, accounts[0], userPubKey, fee)
        .on('createTaskInputReceipt', (receipt) => resolve(receipt))
        .on('error', (error) => reject(error));
    })
      .then((taskInput) => {
        taskInput1 = taskInput;
        expect(taskInput).not.to.be.empty;
      });
  });

  let taskRecord1;
  it('should create task record', () => {
    return web3.eth.getBlockNumber().
      then((blockNumber) => {
        return new Promise((resolve, reject) => {
          enigma.createTaskRecord(taskInput1)
            .on('taskRecordReceipt', (receipt) => resolve(receipt))
            .on('error', (error) => reject(error));
        });
      }).
      then((taskRecord) => {
        taskRecord1 = taskRecord;
        expect(taskRecord.receipt).not.to.be.empty;
      });
  });

  it('should get the pending task', () => {
    return enigma.getTaskRecordStatus(taskRecord1).then((taskRecord) => {
      console.log('Task Record:', taskRecord);
      expect(taskRecord.status).to.equal(1);
    });
  });

  let outStateDelta;
  it('should simulate the task receipt', () => {
    const enigmaContract = enigma.enigmaContract;
    const inStateDelta = '0x0000000000000000000000000000000000000000000000000000000000000000';
    outStateDelta = web3.utils.soliditySha3('test');
    const ethCall = web3.utils.soliditySha3('test');
    const proof = web3.utils.soliditySha3(
      {t: 'bytes32', v: taskRecord1.taskId},
      {t: 'bytes32', v: inStateDelta},
      {t: 'bytes32', v: outStateDelta},
      {t: 'bytes', v: ethCall},
    );
    const sig = utils.sign(data.worker[4], proof);
    return new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipt(scAddr, taskRecord1.taskId, inStateDelta, outStateDelta, ethCall, sig)
        .send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        }).
        on('receipt', (receipt) => resolve(receipt)).
        on('error', (error) => reject(error));
    }).then((result) => {
      console.log(result);
      expect(result.events.ReceiptVerified).not.to.be.empty;
    });
  });

  it('should get the confirmed task', () => {
    return enigma.getTaskRecordStatus(taskRecord1).then((taskRecord) => {
      console.log('Task Record:', taskRecord);
      expect(taskRecord.status).to.equal(2);
    });
  });

  it('should count state deltas', () => {
    return enigma.admin.countStateDeltas(scAddr).then((count) => {
      expect(count).to.equal(1);
    });
  });

  let stateDeltaHash;
  it('should get state delta hash', () => {
    return enigma.admin.getStateDeltaHash(scAddr, 0).then((delta) => {
      stateDeltaHash = delta;
      expect(delta).not.to.be.empty;
    });
  });

  it('should verify state delta', () => {
    return enigma.admin.isValidDeltaHash(scAddr, stateDeltaHash).then((isValid) => {
      expect(isValid).to.equal(true);
    });
  });

  let taskRecords;
  it('should create multiple task records', () => {
    return web3.eth.getBlockNumber().
      then((blockNumber) => {
        let taskInputA;
        let taskInputB;
        const argsA = [200000, 300000];
        const argsB = [300000, 400000];
        return new Promise((resolve, reject) => {
          enigma.createTaskInput(fn, args2, scAddr, accounts[0], userPubKey, fee)
            .on('createTaskInputReceipt', (receipt) => resolve(receipt))
            .on('error', (error) => reject(error));
        })
          .then((taskInput) => {
            taskInputA = taskInput;
            return new Promise((resolve, reject) => {
              enigma.createTaskInput(fn, args2, scAddr, accounts[0], userPubKey, fee)
                .on('createTaskInputReceipt', (receipt) => resolve(receipt))
                .on('error', (error) => reject(error));
            });
          })
          .then((taskInput) => {
            taskInputB = taskInput;
            return [taskInputA, taskInputB];
          })
          .then((taskInputs) => {
            console.log('creating task records for inputs', taskInputs);
            return new Promise((resolve, reject) => {
              enigma.createTaskRecords(taskInputs)
                .on('taskRecordsReceipt', (receipt) => resolve(receipt))
                .on('error', (error) => reject(error));
            });
          })
          .then((results) => {
            for (let i = 0; i < taskRecords.length; i++) {
              expect(results[i].taskId).to.equal(taskRecords[i].taskId);
            }
          });

        let taskInput1;
        it('should create TaskInput', () => {
          return new Promise((resolve, reject) => {
            enigma.createTaskInput(fn, args1, scAddr, accounts[0], userPubKey, fee)
              .on('createTaskInputReceipt', (receipt) => resolve(receipt))
              .on('error', (error) => reject(error));
          })
            .then((taskInput) => {
              taskInput1 = taskInput;
              expect(taskInput).not.to.be.empty;
            });
        });

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
            on('taskRecordsReceipt', (receipt) => resolve(receipt)).
            on('error', (error) => reject(error));
        });
      }).
      then((results) => {
        for (let i = 0; i < taskRecords.length; i++) {
          expect(results[i].taskId).to.equal(taskRecords[i].taskId);
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
        expect(task.status).to.equal(0);
      });
    });
  });

  let outStateDeltas;
  it('should simulate multiple task receipts', () => {
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
    return new Promise((resolve, reject) => {
      enigmaContract.methods.commitReceipts(scAddr, taskIds, inStateDeltas, outStateDeltas, ethCall, sig).
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
    let promises = [];
    taskRecords.map((t) => t.taskId).forEach((taskId) => {
      promises.push(enigma.getTask(taskId));
    });
    Promise.all(promises).then((tasks) => {
      tasks.forEach((task) => {
        expect(task.status).to.equal(1);
      });
    });
  });

  it('should get state delta hash range', () => {
    enigma.admin.getStateDeltaHashes(scAddr, 0, 3).then((hashes) => {
      expect(hashes).to.equal([outStateDelta, outStateDeltas[0], outStateDeltas[1]]);
    });
  });

  let params;
  it('should get the worker parameters for the current block', () => {
    return web3.eth.getBlockNumber().
      then((blockNumber) => {
        return enigma.getWorkerParams(blockNumber);
      }).
      then((result) => {
        params = result;
        expect(params).not.to.be.empty;
      });
  });

  it('should get the selected workers for the contract / epoch', () => {
    const enigmaContract = enigma.enigmaContract;
    let blockNumber;
    let contractSelectWorkers;
    return web3.eth.getBlockNumber().
      then((bn) => {
        blockNumber = bn;
        return enigmaContract.methods.getWorkerGroup(blockNumber, scAddr).call();
      }).
      then((group) => {
        contractSelectWorkers = group;
        return enigma.getWorkerParams(blockNumber);
      }).
      then((params) => {
        const group = enigma.selectWorkerGroup(blockNumber, scAddr, params, 5);
        for (let i = 0; i < group.length; i++) {
          expect(group[i]).to.equal(contractSelectWorkers[i]);
        }
      });
  });

  let task;
  it('should encrypt task inputs', () => {
    const fn = 'medianWealth(int32,int32)';
    const args = [200000, 300000];
    const userPubKey = '04f542371d69af8ebe7c8a00bdc5a9d9f39969406d6c1396037' +
      'ede55515845dda69e42145834e631628c628812d85c805e9da1c56415b32cf99d5ae900f1c1565c';
    return new Promise((resolve, reject) => {
      enigma.createTaskInput(taskId, fn, args, scAddr, userPubKey)
        .on('createTaskInput', (result) => {
          resolve(result);
        })
    })
      .then((result) => {
        task = result;
        console.log('TaskInput creation', task);
        expect(task.encodedInputs).not.to.be.empty;
      })

  });

  it('should send task inputs to the network', () => {
    return new Promise((resolve, reject) => {
      enigma.client.request('sendTaskInputs', task.serialize(), (err, error, result) => {
        if (err) {
          reject(err);
        }
        resolve(result);
      });
    })
      .then((result) => {
        expect(result[0]).to.equal('successfully sent task inputs');
      });
  });

  it('should poll the network for unconfirmed task', () => {
    todo();
  });

  it('should poll the network for confirmed task', () => {
    todo();
  });
});
