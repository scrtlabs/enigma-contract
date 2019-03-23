/* eslint-disable require-jsdoc */
import dotenv from 'dotenv';
import Enigma from '../src/Enigma';
import utils from '../src/enigma-utils';
import forge from 'node-forge';
import Web3 from 'web3';
import EthCrypto from 'eth-crypto';
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaContractSimulation from '../../build/contracts/EnigmaSimulation';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import data from './data';
import * as eeConstants from '../src/emitterConstants';
import SampleContract from '../../build/contracts/Sample';
import {execInContainer, getStateKeysInContainer} from './principal-utils';

dotenv.config();

// Launch local mock JSON RPC Server
import RPCServer from '../src/Server';

forge.options.usePureJavaScript = true;

describe('Enigma tests', () => {
    let server;

    beforeAll(() => {
      server = new RPCServer();
      server.listen();
    });

    afterAll((done) => {
      server.close(done);
    });

    let accounts;
    let web3;
    let enigma;
    let sampleContract;
    it('initializes', () => {
      const provider = new Web3.providers.HttpProvider('http://localhost:9545');
      web3 = new Web3(provider);
      return web3.eth.getAccounts().then((result) => {
        accounts = result;
        console.log('the accounts', accounts);
        enigma = new Enigma(
          web3,
          (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
            EnigmaContractSimulation.networks['4447'].address :
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

    it('initializes Sample contract', async () => {
      sampleContract = new enigma.web3.eth.Contract(SampleContract['abi'],
        SampleContract.networks['4447'].address);
      expect(sampleContract.options.address).toBeTruthy();
    });

    it('should generate and save key/pair', () => {
      const {publicKey, privateKey} = enigma.obtainTaskKeyPair();
      expect(privateKey).toEqual('1737611edbedec5546e1457769f900b8d7daef442d966e60949decd63f9dd86f');
      expect(publicKey).toEqual('2ea8e4cefb78efd0725ed12b23b05079a0a433cc8a656f212accf58672fee44a20cfcaa50466237273' +
        'e762e49ec912be61358d5e90bff56a53a0ed42abfe27e3');
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

    it('should fail to login since principal node has not been registered yet', async () => {
      await expect(new Promise((resolve, reject) => {
        enigma.admin.login(accounts[0]).on(eeConstants.LOGIN_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Principal node has not ' +
        'been initialized');
    });

    it('should simulate principal node registration', async () => {
      let receipt;
      if (process.env.PRINCIPAL_CONTAINER) {
        const tx = await execInContainer(enigma, '--register', true);
        receipt = await web3.eth.getTransactionReceipt(tx);
      } else {
        let worker = data.principal;
        console.log('setting principal node', worker[0]);
        const report = '0x' + Array.from(worker[1]).map((c) => c.charCodeAt(0).toString(16)).join('');
        const signature = '0x' + worker[3];
        // Using the same artificial data for all workers
        receipt = await new Promise((resolve, reject) => {
          enigma.enigmaContract.methods.register(worker[0], report, signature).send({
            gas: 4712388,
            gasPrice: 100000000000,
            from: accounts[8],
          }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
        });
      }
      expect(receipt).toBeTruthy();
    }, 30000);

    it('should set the worker parameters (principal only)', async () => {
      let receipt;
      if (process.env.PRINCIPAL_CONTAINER) {
        const tx = await execInContainer(enigma, '--set-worker-params');
        receipt = await web3.eth.getTransactionReceipt(tx);
      } else {
        let blockNumber = await web3.eth.getBlockNumber();
        let getActiveWorkersResult = await enigma.enigmaContract.methods.getActiveWorkers(blockNumber).call({
          from: accounts[8],
        });
        let workerAddresses = getActiveWorkersResult['0'];
        let workerStakes = getActiveWorkersResult['1'];
        const seed = Math.floor(Math.random() * 100000);
        const msg = web3.eth.abi.encodeParameters(
          ['uint256', 'uint256', 'address[]', 'uint256[]'],
          [seed, 0, workerAddresses, workerStakes],
        );
        const hash = web3.utils.keccak256(msg);
        const sig = EthCrypto.sign(data.principal[4], hash);

        receipt = await new Promise((resolve, reject) => {
          enigma.enigmaContract.methods.setWorkersParams(blockNumber, seed, sig).send({
            gas: 4712388,
            gasPrice: 100000000000,
            from: accounts[8],
          }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => {
            console.log('errored');
            reject(error);
          });
        });
      }
      expect(receipt).toBeTruthy();
    }, 30000);

    it('should get the worker parameters for the current block', async () => {
      const blockNumber = await web3.eth.getBlockNumber();
      const workerParams = await enigma.getWorkerParams(blockNumber);
      expect(workerParams.workers).toEqual([]);
      expect(workerParams.stakes).toEqual([]);
    });

    it('should fail to set worker params (principal only) since it already has during this epoch', async () => {
      const reason = 'Returned error: VM Exception while processing transaction: ' +
        'revert Already called during this epoch';
      if (process.env.PRINCIPAL_CONTAINER) {
        try {
          await execInContainer(enigma, '--set-worker-params');
        } catch (e) {
          // TODO: Print the reason in the logs
          expect(true).toBeTruthy();
          return;
        }
      }
      const blockNumber = await web3.eth.getBlockNumber();
      let getActiveWorkersResult = await enigma.enigmaContract.methods.getActiveWorkers(blockNumber).call({
        from: accounts[8],
      });
      let workerAddresses = getActiveWorkersResult['0'];
      let workerStakes = getActiveWorkersResult['1'];
      const seed = Math.floor(Math.random() * 100000);
      const msg = web3.eth.abi.encodeParameters(
        ['uint256', 'uint256', 'address[]', 'uint256[]'],
        [seed, 1, workerAddresses, workerStakes],
      );
      const hash = web3.utils.keccak256(msg);
      const sig = EthCrypto.sign(data.principal[4], hash);
      await expect(new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.setWorkersParams(blockNumber, seed, sig).send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[8],
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => {
          reject(error.message);
        });
      })).rejects.toEqual(reason);
    }, 30000);

    it('should move forward epochSize blocks by calling dummy contract', async () => {
      const epochSize = await enigma.enigmaContract.methods.getEpochSize().call();
      for (let i = 0; i < epochSize; i++) {
        await sampleContract.methods.incrementCounter().send({from: accounts[8]});
      }
    });

    it('should fail to login an unregistered worker', async () => {
      await expect(new Promise((resolve, reject) => {
        enigma.admin.login(accounts[0]).on(eeConstants.LOGIN_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      })).
        rejects.
        toEqual('Returned error: VM Exception while processing transaction: revert Worker not registered or ' +
          'not logged out');
    });

    it('should simulate worker registration', async () => {
      let promises = [];
      for (let i = 0; i < accounts.length - 1; i++) {
        if (i === 8) {
          continue;
        }
        let worker = data.workers[i];
        const report = '0x' + Array.from(worker[1]).map((c) => c.charCodeAt(0).toString(16)).join('');
        const signature = '0x' + worker[3];
        // Using the same artificial data for all workers
        let promise = new Promise((resolve, reject) => {
          enigma.enigmaContract.methods.register(worker[0], report, signature).send({
            gas: 4712388,
            gasPrice: 100000000000,
            from: accounts[i],
          }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
        });
        promises.push(promise);
      }
      // Using the account as the signer for testing purposes
      const registerWorkersResults = await Promise.all(promises);
      expect(registerWorkersResults.length).toEqual(accounts.length - 2);
    }, 20000);

    it('should get the worker report', async () => {
      const report = await enigma.getReport(accounts[0]);
      expect(report).toBeTruthy();
    });

    it('should check workers have been registered and are in a logged out state', async () => {
      let workerStatuses = [];
      for (let i = 0; i < accounts.length - 2; i++) {
        workerStatuses.push(await enigma.admin.getWorkerStatus(accounts[i]));
      }
      for (let workerStatus of workerStatuses) {
        expect(workerStatus).toEqual(2);
      }
    });

    it('should fail to login a worker with insufficient balance', async () => {
      await expect(new Promise((resolve, reject) => {
        enigma.admin.login(accounts[0]).on(eeConstants.LOGIN_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      })).
        rejects.
        toEqual('Returned error: VM Exception while processing transaction: revert Worker\'s balance is not ' +
          'sufficient');
    });

    it('should check workers\' balances are empty', async () => {
      let balances = [];
      for (let i = 0; i < accounts.length - 1; i++) {
        if (i === 8) {
          continue;
        }
        balances.push(await enigma.admin.getBalance(accounts[i]));
      }
      expect(balances).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('should fail to deposit too large a token amount', async () => {
      await expect(new Promise((resolve, reject) => {
        enigma.admin.deposit(accounts[1], utils.toGrains(1001)).
          on(eeConstants.DEPOSIT_RECEIPT, (result) => resolve(result)).
          on(eeConstants.ERROR, (err) => {
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
          enigma.admin.deposit(accounts[i], utils.toGrains(deposits[i])).
            on(eeConstants.DEPOSIT_RECEIPT, (result) => resolve(result)).
            on(eeConstants.ERROR, (err) => {
              reject(err);
            });
        });
        promises.push(promise);
      }
      const results = await Promise.all(promises);
      expect(results.length).toEqual(8);
    });

    it('should check workers\' balances have been filled', async () => {
      let balances = [];
      for (let i = 0; i < accounts.length - 1; i++) {
        if (i === 8) {
          continue;
        }
        balances.push(await enigma.admin.getBalance(accounts[i]));
      }
      expect(balances).toEqual([900, 100, 10, 20, 100, 200, 40, 100].map((balance) => balance * 10 ** 8));
    });

    it('should login all the workers', async () => {
      let promises = [];
      for (let i = 0; i < accounts.length - 1; i++) {
        if (i === 8) {
          continue;
        }
        let promise = new Promise((resolve, reject) => {
          enigma.admin.login(accounts[i]).on(eeConstants.LOGIN_RECEIPT, (result) => {
            resolve(result);
          });
        });
        promises.push(promise);
      }
      const loginReceipts = await Promise.all(promises);
      expect(loginReceipts.length).toEqual(8);
    });

    it('should check workers have been logged in', async () => {
      let workerStatuses = [];
      for (let i = 0; i < accounts.length - 2; i++) {
        workerStatuses.push(await enigma.admin.getWorkerStatus(accounts[i]));
      }
      for (let workerStatus of workerStatuses) {
        expect(workerStatus).toEqual(1);
      }
    });

    it('should logout, fail to logout again, and log back in a worker', async () => {
      await new Promise((resolve, reject) => {
        enigma.admin.logout(accounts[0]).on(eeConstants.LOGOUT_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      });
      let workerStatus = await enigma.admin.getWorkerStatus(accounts[0]);
      expect(workerStatus).toEqual(2);
      await expect(new Promise((resolve, reject) => {
        enigma.admin.logout(accounts[0]).on(eeConstants.LOGOUT_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Worker not logged in');
      await new Promise((resolve, reject) => {
        enigma.admin.login(accounts[0]).on(eeConstants.LOGIN_RECEIPT, (result) => {
          resolve(result);
        });
      });
      workerStatus = await enigma.admin.getWorkerStatus(accounts[0]);
      expect(workerStatus).toEqual(1);
    });

    it('should fail to withdraw because worker is still logged in', async () => {
      let withdrawAmount = utils.toGrains(100);
      await expect(new Promise((resolve, reject) => {
        enigma.admin.withdraw(accounts[7], withdrawAmount).on(eeConstants.WITHDRAW_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      })).
        rejects.
        toEqual('Returned error: VM Exception while processing transaction: revert Worker not registered or ' +
          'not logged out');
    });

    it('should fail to withdraw in same epoch as logout', async () => {
      await new Promise((resolve, reject) => {
        enigma.admin.logout(accounts[7]).on(eeConstants.LOGOUT_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      });
      let withdrawAmount = utils.toGrains(100);
      await expect(new Promise((resolve, reject) => {
        enigma.admin.withdraw(accounts[7], withdrawAmount).on(eeConstants.WITHDRAW_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      })).
        rejects.
        toEqual('Returned error: VM Exception while processing transaction: revert Cannot withdraw in same ' +
          'epoch as log out event');
    });

    it('should set the worker parameters (principal only) again for a new epoch', async () => {
      let receipt;
      if (process.env.PRINCIPAL_CONTAINER) {
        const tx = await execInContainer(enigma, '--set-worker-params');
        receipt = await web3.eth.getTransactionReceipt(tx);
      } else {
        let blockNumber = await web3.eth.getBlockNumber();
        let getActiveWorkersResult = await enigma.enigmaContract.methods.getActiveWorkers(blockNumber).call({
          from: accounts[8],
        });
        let workerAddresses = getActiveWorkersResult['0'];
        let workerStakes = getActiveWorkersResult['1'];
        const seed = Math.floor(Math.random() * 100000);
        const msg = web3.eth.abi.encodeParameters(
          ['uint256', 'uint256', 'address[]', 'uint256[]'],
          [seed, 1, workerAddresses, workerStakes],
        );
        const hash = web3.utils.keccak256(msg);
        const sig = EthCrypto.sign(data.principal[4], hash);

        receipt = await new Promise((resolve, reject) => {
          enigma.enigmaContract.methods.setWorkersParams(blockNumber, seed, sig).send({
            gas: 4712388,
            gasPrice: 100000000000,
            from: accounts[8],
          }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => {
            console.log('errored');
            reject(error);
          });
        });
      }
      expect(receipt).toBeTruthy();
    }, 30000);

    it('should get the worker parameters for the current block', async () => {
      const blockNumber = await web3.eth.getBlockNumber();
      const workerParams = await enigma.getWorkerParams(blockNumber);
      expect(workerParams.workers).toEqual(data.workers.map((w) => web3.utils.toChecksumAddress(w[0])).slice(0, 7));
      expect(workerParams.stakes).
        toEqual([900, 100, 10, 20, 100, 200, 40].map((stake) => web3.utils.toBN(stake * 10 ** 8)));
    });

    it('should fail to withdraw too many tokens from worker bank', async () => {
      let withdrawAmount = utils.toGrains(101);
      await expect(new Promise((resolve, reject) => {
        enigma.admin.withdraw(accounts[7], withdrawAmount).on(eeConstants.WITHDRAW_RECEIPT, (result) => {
          resolve(result);
        }).on(eeConstants.ERROR, (err) => {
          reject(err);
        });
      })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Not enough tokens in ' +
        'worker balance');
    });

    it('should withdraw tokens from worker bank', async () => {
      let withdrawAmount = utils.toGrains(100);
      const startingBalance = await enigma.admin.getBalance(accounts[7]);
      await new Promise((resolve, reject) => {
        enigma.admin.withdraw(accounts[7], withdrawAmount).
          on(eeConstants.WITHDRAW_RECEIPT, (result) => resolve(result)).
          on(eeConstants.ERROR, (err) => {
            reject(err);
          });
      });
      const endingBalance = await enigma.admin.getBalance(accounts[7]);
      expect(endingBalance - startingBalance).toEqual(-withdrawAmount);
    });

    let scTask;
    let preCode;
    it('should create deploy contract task', async () => {
      preCode = '9d075ae';
      let scTaskFn = 'deployContract(string,uint)';
      let scTaskArgs = [
        ['first_sc', 'string'],
        [1, 'uint'],
      ];
      let scTaskGasLimit = 100;
      let scTaskGasPx = utils.toGrains(1);
      scTask = await new Promise((resolve, reject) => {
        enigma.createTask(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode, true).
          on(eeConstants.CREATE_TASK, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(scTask).toBeTruthy();
      expect(scTask.scAddr).toBeTruthy();
      expect(scTask.preCode).not.toEqual('');
      expect(scTask.preCodeHash).not.toEqual('');
      expect(scTask.encryptedFn).toBeTruthy();
      expect(scTask.encryptedAbiEncodedArgs).toBeTruthy();
      expect(scTask.gasLimit).toEqual(scTaskGasLimit);
      expect(scTask.gasPx).toEqual(scTaskGasPx);
      expect(scTask.msgId).toBeTruthy();
      expect(scTask.sender).toEqual(accounts[0]);
      const msg = web3.utils.soliditySha3(
        {t: 'bytes', v: scTask.encryptedFn},
        {t: 'bytes', v: scTask.encryptedAbiEncodedArgs},
      );
      const signer = enigma.web3.eth.accounts.recover(msg, scTask.userTaskSig);
      expect(signer).toEqual(accounts[0]);
      expect(scTask.nonce).toEqual(0);
    });

    it('should fail to create deploy contract task record due to incorrect nonce/scAddr', async () => {
      let corruptedTask = {...scTask, nonce: scTask.nonce + 1};
      await expect(new Promise((resolve, reject) => {
        enigma.createTaskRecord(corruptedTask).
          on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Incorrect nonce ' +
        'yielding bad secret contract address');
    });

    it('should fail to create deploy contract task record with incorrect worker', async () => {
      let corruptedTask = {...scTask, firstBlockNumber: 0};
      await expect(new Promise((resolve, reject) => {
        enigma.createTaskRecord(corruptedTask).
          on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).
        rejects.
        toEqual('Returned error: VM Exception while processing transaction: revert Wrong epoch for this task');
    });

    it('should create deploy contract task record', async () => {
      const startingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      scTask = await new Promise((resolve, reject) => {
        enigma.createTaskRecord(scTask).
          on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      const endingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      expect(scTask.receipt).toBeTruthy();
      expect(scTask.transactionHash).toBeTruthy();
      expect(scTask.taskId).toBeTruthy();
      expect(scTask.ethStatus).toEqual(1);
      expect(scTask.proof).toBeFalsy();
      expect(endingContractBalance - startingContractBalance).toEqual(scTask.gasLimit * scTask.gasPx);
    });

    it('should get the worker parameters for the current block', async () => {
      const blockNumber = await web3.eth.getBlockNumber();
      const workerParams = await enigma.getWorkerParams(blockNumber);
      expect(workerParams).toBeTruthy();
    });

    it('should get the selected workers for the contract / epoch', async () => {
      const contractSelectWorkers = await enigma.enigmaContract.methods.getWorkerGroup(scTask.creationBlockNumber,
        scTask.taskId).call();
      const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
      const group = await enigma.selectWorkerGroup(scTask.taskId, workerParams, 1);
      for (let i = 0; i < group.length; i++) {
        expect(group[i]).toEqual(contractSelectWorkers[i]);
      }
    });

    it('should fail to send corrupted task input to the network', async () => {
      let corruptedTask = {...scTask, preCode: ''};
      await expect(new Promise((resolve, reject) => {
        enigma.sendTaskInput(corruptedTask).
          on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    });

    it('should send deploy contract task inputs to Enigma Network', async () => {
      scTask = await new Promise((resolve, reject) => {
        enigma.sendTaskInput(scTask).
          on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(scTask).toBeTruthy();
    });

    it('should fail to create/send deploy contract task using wrapper function because of failed worker encryption ' +
      'key rpc call', async () => {
      server.close(true);
      const consoleError = console.error; // save original console for future use
      console.error = jest.fn(); // mock console output to be disregarded, we know the following will error out
      preCode = '9d075ae';
      let scTaskFn = 'deployContract(string,uint)';
      let scTaskArgs = [
        ['first_sc', 'string'],
        [1, 'uint'],
      ];
      let scTaskGasLimit = 100;
      let scTaskGasPx = utils.toGrains(1);
      await expect(new Promise((resolve, reject) => {
        enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode).
          on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual({code: -32000, message: 'Network Error'});
      console.error = consoleError; // restore the original console
      server.listen();
    });

    it('should fail to create/send deploy contract task using wrapper function due to insufficient funds',
      async () => {
        preCode = '9d075ae';
        let scTaskFn = 'deployContract(string,uint)';
        let scTaskArgs = [
          ['first_sc', 'string'],
          [1, 'uint'],
        ];
        let scTaskGasLimit = 100;
        let scTaskGasPx = utils.toGrains(1);
        await expect(new Promise((resolve, reject) => {
          enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[9], preCode).
            on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
            on(eeConstants.ERROR, (error) => reject(error));
        })).rejects.toEqual({message: 'Not enough tokens to pay the fee', name: 'NotEnoughTokens'});
      });

    it('should create/send deploy contract task using wrapper function', async () => {
      preCode = '9d075ae';
      let scTaskFn = 'deployContract(string,uint)';
      let scTaskArgs = [
        ['first_sc', 'string'],
        [1, 'uint'],
      ];
      let scTaskGasLimit = 100;
      let scTaskGasPx = utils.toGrains(1);
      const startingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      scTask = await new Promise((resolve, reject) => {
        enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode).
          on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      const endingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      expect(scTask).toBeTruthy();
      expect(scTask.scAddr).toBeTruthy();
      expect(scTask.preCode).not.toEqual('');
      expect(scTask.preCodeHash).not.toEqual('');
      expect(scTask.encryptedFn).toBeTruthy();
      expect(scTask.encryptedAbiEncodedArgs).toBeTruthy();
      expect(scTask.gasLimit).toEqual(scTaskGasLimit);
      expect(scTask.gasPx).toEqual(scTaskGasPx);
      expect(scTask.msgId).toBeTruthy();
      expect(scTask.sender).toEqual(accounts[0]);
      const msg = web3.utils.soliditySha3(
        {t: 'bytes', v: scTask.encryptedFn},
        {t: 'bytes', v: scTask.encryptedAbiEncodedArgs},
      );
      expect(enigma.web3.eth.accounts.recover(msg, scTask.userTaskSig)).toEqual(accounts[0]);
      expect(scTask.nonce).toEqual(1);
      expect(scTask.receipt).toBeTruthy();
      expect(scTask.transactionHash).toBeTruthy();
      expect(scTask.taskId).toBeTruthy();
      expect(scTask.ethStatus).toEqual(1);
      expect(scTask.proof).toBeFalsy();
      expect(endingContractBalance - startingContractBalance).toEqual(scTask.gasLimit * scTask.gasPx);
      expect(scTask).toBeTruthy();
    });

    let codeHash;
    let initStateDeltaHash;
    // it('should simulate the contract deployment failure', async () => {
    //   console.log('Simulating deployment failure with task', scTask);
    //   const gasUsed = 25;
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: scTask.inputsHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'bytes1', v: '0x00'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    //   console.log('The worker params:', workerParams);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
    //   console.log('Found selected worker address:', selectedWorkerAddr);
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   console.log('Found worker from signing address', worker);
    //   const startingWorkerBalance = worker.balance;
    //   const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
    //   const result = await new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.deploySecretContractFailure(scTask.taskId, gasUsed, sig).send({
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    //   });
    //   worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const endingWorkerBalance = worker.balance;
    //   const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
    //   expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * scTask.gasPx);
    //   expect(endingSenderBalance - startingSenderBalance).toEqual((scTask.gasLimit - gasUsed) * scTask.gasPx);
    //   expect(result.events.ReceiptFailed).toBeTruthy;
    // });
    //
    // it('should fail to simulate contract deployment of already failed task', async () => {
    //   const gasUsed = 25;
    //   codeHash = web3.utils.soliditySha3('1a2b3c4d');
    //   initStateDeltaHash = web3.utils.soliditySha3('initialized');
    //   const optionalEthereumData = '0x00';
    //   const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: scTask.inputsHash},
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'bytes32', v: initStateDeltaHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.deploySecretContract(scTask.taskId, scTask.preCodeHash, codeHash,
    //       initStateDeltaHash, optionalEthereumData, optionalEthereumContractAddress, gasUsed, sig).send({
    //       gas: 4712388,
    //       gasPrice: 100000000000,
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
    //   })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Invalid task status');
    // });
    //
    // it('should create/send deploy contract task using wrapper function', async () => {
    //   preCode = '9d075ae';
    //   let scTaskFn = 'deployContract(string,uint)';
    //   let scTaskArgs = [
    //     ['first_sc', 'string'],
    //     [1, 'uint'],
    //   ];
    //   let scTaskGasLimit = 100;
    //   let scTaskGasPx = utils.toGrains(1);
    //   const startingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   scTask = await new Promise((resolve, reject) => {
    //     enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode).
    //       on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   const endingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   expect(scTask).toBeTruthy();
    //   expect(scTask.scAddr).toBeTruthy();
    //   expect(scTask.preCode).not.toEqual('');
    //   expect(scTask.preCodeHash).not.toEqual('');
    //   expect(scTask.encryptedFn).toBeTruthy();
    //   expect(scTask.encryptedAbiEncodedArgs).toBeTruthy();
    //   expect(scTask.gasLimit).toEqual(scTaskGasLimit);
    //   expect(scTask.gasPx).toEqual(scTaskGasPx);
    //   expect(scTask.msgId).toBeTruthy();
    //   expect(scTask.sender).toEqual(accounts[0]);
    //   const msg = web3.utils.soliditySha3(
    //     {t: 'bytes', v: scTask.encryptedFn},
    //     {t: 'bytes', v: scTask.encryptedAbiEncodedArgs},
    //   );
    //   expect(enigma.web3.eth.accounts.recover(msg, scTask.userTaskSig)).toEqual(accounts[0]);
    //   expect(scTask.nonce).toEqual(2);
    //   expect(scTask.receipt).toBeTruthy();
    //   expect(scTask.transactionHash).toBeTruthy();
    //   expect(scTask.taskId).toBeTruthy();
    //   expect(scTask.ethStatus).toEqual(1);
    //   expect(scTask.proof).toBeFalsy();
    //   expect(endingContractBalance - startingContractBalance).toEqual(scTask.gasLimit * scTask.gasPx);
    //   expect(scTask).toBeTruthy();
    // });

    it('should simulate the contract deployment', async () => {
      const gasUsed = 6;
      codeHash = web3.utils.soliditySha3('1a2b3c4d');
      initStateDeltaHash = web3.utils.soliditySha3('initialized');
      const optionalEthereumData = '0x';
      const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
      // const proof = web3.utils.soliditySha3(
      //   {t: 'bytes32', v: scTask.inputsHash},
      //   {t: 'bytes32', v: codeHash},
      //   {t: 'bytes32', v: initStateDeltaHash},
      //   {t: 'uint', v: gasUsed},
      //   {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
      //   {t: 'bytes', v: optionalEthereumData},
      //   {t: 'uint64', v: 20},
      //   {t: 'address', v: optionalEthereumContractAddress},
      //   {t: 'bytes1', v: '0x01'},
      // );
      const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
      // const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = '0x76332366ccd6ce2344e24bac3aa5f8db9b9a56f30cb92d16cd321d70335ab75154939cc46b1b20ee009c8da92405643e96569306025fe20119f20e1cd7031f141c';
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(1);
      expect(sampleContractBool).toEqual(false);
      codeHash = web3.utils.soliditySha3(
        {t: 'bytes', v: '0x0061736d010000000193011660017f0060037f7f7f017f60027f7f017f60027f7f006000017f60047f7f7f7f0060000060037f7f7f0060017f017f60017c017f60037f7f7e0060027c7f017f60057f7f7f7f7f0060077e7e7e7f7f7f7f017e60027e7f0060047e7e7e7f017e60067f7f7f7f7f7f017f60077f7f7f7f7f7f7f017f60057f7f7f7f7f017f60017f017e60057f7e7e7e7e0060047f7e7e7f000291010703656e761a66657463685f66756e6374696f6e5f6e616d655f6c656e677468000403656e761366657463685f66756e6374696f6e5f6e616d65000003656e761166657463685f617267735f6c656e677468000403656e760a66657463685f61726773000003656e760b77726974655f7374617465000503656e7603726574000303656e76066d656d6f7279020178800103980196010507000600000305030303030208000901020a0a0b03030800000503080606000002010302020307030c03030208060303030000000007000201060202030202010207020202020202000808000000000d0e020f000200080600000303020610051102020200120001010202020207020202000300020200130203000007000300000603020000080301030300000501010114141515040501700123230609017f01418080c0000b0709010463616c6c0088010928010041010b22684d696a734142494a4b474e5b7c32274c3d4644456b767f6d6f717b786e70727d7e0aa0b00296018b06010c7f230041206b22042400200128020041d280c00041011007200441033a0010200220036a21052003417f7321062002417f6a2107200441106a100841002108200441056a21092002210a02400240024003402005200a6b210e4100210d0340200e200d460d02200a200d6a210b200d41016a210d200b2d0000220c41db82c0006a2d0000220b450d000b02402008200d6a220e417f6a220f20084d0d002004200336020420042002360200200420083602082004200f36020c02402008450d0020082003460d00200820034f0d04200220086a2c000041bf7f4c0d040b0240200620086a200d6a450d00200f20034f0d04200720086a200d6a2c000041bf7f4c0d040b2001280200200220086a200d417f6a1007200441033a0010200441106a10080b0240024002400240200b41927f6a220841074b0d00024002400240024020080e080007070702070301000b41d880c000210b0c040b200441046a200c41047641cb82c0006a2d00003a00002009200c410f7141cb82c0006a2d00003a0000200441dceac1810336000020012802002004410610070c040b41d680c000210b0c020b41d480c000210b0c010b0240200b41e600470d0041da80c000210b0c010b0240200b41dc00470d0041de80c000210b0c010b0240200b41e200470d0041dc80c000210b0c010b200b4122470d0241e080c000210b0b2001280200200b410210070b200441033a0010200a200d6a210a200441106a1008200e21080c010b0b1009000b024020082003460d002004200336020420042002360200200420083602082004200336020c02402008450d00200820034f0d03200220086a22022c000041bf7f4c0d030b20012802002002200320086b1007200441033a0010200441106a10080b200441033a0010200441106a1008200128020041d280c00041011007200441033a0010200441106a1008200041033a0000200441206a24000f0b2004200441086a3602142004200436021020042004410c6a360218200441106a100a000b2004200441086a3602142004200436021020042004410c6a360218200441106a100b000b2901017f20002002102920002000280208220320026a360208200320002802006a200120021095011a0b1300024020002d00004103460d002000101e0b0b0a0041f8fdc0001026000b2601017f200028020022012802002001280204200028020428020020002802082802001020000b2601017f200028020022012802002001280204200028020428020020002802082802001020000b0f002000200141ecfdc0004101100d0b11002001200220031007200041033a00000b0f002000200141eefdc0004104100d0b0f002000200141d380c0004101100d0b0f002000200141edfdc0004101100d0b0f002000200141e280c0004101100d0bce0803027f017c027f23004180016b220224000240024002400240024002400240024002400240024020002d0000417f6a220341044b0d00024020030e050002030405000b200128020041e1fdc00041e5fdc00020002d000122031b4104410520031b1007200241033a00482002200241c8006a1013220336022020030d0a200241206a10140c080b200241c8006a2001280200100e2002200241c8006a1013220336022020030d09200241206a10140c070b200041086a28020022034101460d0320034102470d04200041106a2b03002204101541ff017141014b0d05200241c8006a2001280200100e2002200241c8006a1013220336022020030d08200241206a10140c060b2001200041046a2802002000410c6a280200101621030c070b2001200041046a101721030c060b02402000410c6a280200450d00200241c8006a200128020010102002200241c8006a1013220336022020030d06200241206a1014410121050c050b200241c8006a200128020010102002200241c8006a1013220336022020030d05200241206a1014200241c8006a2001280200100c2002200241c8006a1013220336022020030d05200241206a1014410021050c040b200241106a200241c8006a200041106a29030010182001280200200228021020022802141007200241033a0020200241206a1008200241033a00482002200241c8006a1013220336027820030d04200241f8006a10140c020b200241086a200241c8006a200041106a290300101920012802002002280208200228020c1007200241033a0020200241206a1008200241033a00482002200241c8006a1013220336027820030d03200241f8006a10140c010b2004200241c8006a101a21032001280200200241c8006a20031007200241033a00202002200241206a1013220336027820030d02200241f8006a10140b410021030c010b200241206a200041046a101b200241c8006a200241206a41241095011a02400340200241186a200241c8006a101c20022802182200450d01200228021c21060240200541ff01714101460d00200128020041eafdc000410110070b200241033a00782002200241f8006a1013220336027420030d02200241f4006a101420022001200028020020002802081016220336027820030d02200241f8006a1014200241033a00782002200241f8006a1013220336027420030d02200241f4006a101420024100360244200241c4006a1014200128020041ebfdc00041011007200241033a00782002200241f8006a1013220336027420030d02200241f4006a10142002200620011012220336027820030d02200241f8006a1014200241033a00782002200241f8006a1013220336027420030d02200241f4006a101420024100360244200241c4006a1014410221050c000b0b41002103200541ff0171450d00200241c8006a2001280200100c2002200241c8006a1013220036022002402000450d00200021030c010b200241206a10140b20024180016a240020030b4001017f230041106b22012400024020002d00004103470d00200141106a240041000f0b20012000290200370308200141086a101d2100200141106a240020000b4901027f024020002802002201450d0002400240200128020022024101460d0020020d01200141086a280200450d012001280204101f0c010b200141046a101e0b2000280200101f0b0b5a01027e0240024002402000bd220142ffffffffffffffffff0083500d0020014280808080808080f8ff00832202500d0120024280808080808080f8ff00520d02200142ffffffffffffff0783500f0b41020f0b41030f0b41040b3f01017f230041106b22032400200341086a20002001200210062003200341086a10132200360204024020000d00200341046a10140b200341106a240020000b8a0301047f230041106b220224002001280200210302400240024020012802082204450d00200241086a2000280200100f2002200241086a1013220136020420010d02200241046a1014410121050c010b200241086a2000280200100f2002200241086a1013220136020420010d01200241046a1014200241086a200028020010112002200241086a1013220136020420010d01200241046a1014410021050b200441186c2104024003402004450d010240200541ff01714101460d00200028020041eafdc000410110070b200241033a00082002200241086a1013220136020420010d02200241046a10142002200320001012220136020820010d02200241086a1014200241033a00082002200241086a1013220136020420010d02200341186a2103200241046a101420024100360200200441686a210420021014410221050c000b0b41002101200541ff0171450d00200241086a200028020010112002200241086a1013220336020402402003450d00200321010c010b200241046a10140b200241106a240020010bc50204017e027f017e027f20022002423f8722037c2003852103411421040240034020034290ce00540d01200120046a2205417c6a200320034290ce0080220642f0b17f7e7ca7220741e4006e2208410174419edac0006a2f00003b00002005417e6a2008419c7f6c20076a410174419edac0006a2f00003b00002004417c6a2104200621030c000b0b02402003a7220541e400480d00200120046a417e6a2003a7220741ffff037141e4006e2205419c7f6c20076a41ffff0371410174419edac0006a2f00003b00002004417e6a21040b02400240200541094a0d0020012004417f6a22046a200541306a3a00000c010b20012004417e6a22046a2005410174419edac0006a2f00003b00000b0240024020024200530d00200120046a21050c010b20012004417f6a22046a2205412d3a00000b200020053602002000411420046b3602040b910203027f017e027f411421030240034020024290ce00540d01200120036a2204417c6a200220024290ce0080220542f0b17f7e7ca7220641e4006e2207410174419edac0006a2f00003b00002004417e6a2007419c7f6c20066a410174419edac0006a2f00003b00002003417c6a2103200521020c000b0b02402002a7220441e400480d00200120036a417e6a2002a7220641ffff037141e4006e2204419c7f6c20066a41ffff0371410174419edac0006a2f00003b00002003417e6a21030b02400240200441094a0d0020012003417f6a22036a2206200441306a3a00000c010b20012003417e6a22036a22062004410174419edac0006a2f00003b00000b200020063602002000411420036b3602040ba00e06017f027e047f017e037f047e230041106b220224002000bd220342ffffffffffffff078321042003423488a721054100210602402003427f550d002001412d3a0000410121060b200541ff0f71210502400240200442005222070d0020050d00200120066a220541002f00d8d6403b0000200541026a41002d00dad6403a00002003423f88a741036a21050c010b20072005410249722108200442808080808080800884200420051b220442028621032004420183210902400240024002400240024002400240200541cb776a41cc7720051b22054100480d002004200541c1e8046c4112762207200541034a220a6b220b410474220c41b889c0006a290300200c41c089c0006a290300200741fa006a2005200a6a6b200b41cfa6ca006c4113766a2002200241086a200810562104200b41164f0d0320034205824200510d0120094200520d0220032008ad427f857c2103417f21050340200541016a21052003420580220d427b7e20037c210e200d2103200ea7450d000b2005200b490d034101210a410021070c060b2004410020056b20054185a2536c4114762005417f476b22076b220a410474220b41f8adc0006a290300200b4180aec0006a290300200741f8006a200a41cfa6ca006c4113766b2002200241086a200810562104200720056a210b0240200741024f0d00200950450d04410121074101210a2008450d050c060b2007413f4f0d022003427f2007417f6a413f71ad86427f858350450d020c040b417f21050340200541016a21052003420580220d427b7e20037c210e200d2103200ea7450d000b2005200b490d010c030b20034202842103417f21050340200541016a21052003420580220d427b7e20037c210e200d2103200ea7450d000b200220022903002005200b4fad7d3703000b41002105024002402002290300220342e40080220e2002290308220f42e40080220d580d002002200d3703082002200e370300200442e400802203429c7f7e20047ca741314b2107410221050c010b200f210d2003210e20042103410021070b02400340200e420a802204200d420a80220f580d01200541016a21052003420a80221042767e20037ca741044b2107200f210d2004210e201021030c000b0b2002200e3703002002200d37030820072003200d51722108200321040c030b20022002290300427f7c3703000b4100210a410121070b41002108200229030821032002290300210d4100210502400340200d420a80220f2003420a80220e580d01200541016a2105200841ff0171452007712107200a200e42767e20037ca74571210a2004420a80221042767e20047ca72108200e2103200f210d201021040c000b0b200220033703082002200d3703000240200a410171450d00024003402003420a80220e42767e20037ca70d01200541016a2105200d420a80210d200841ff01714520077121072004420a80220f42767e20047ca72108200e2103200f21040c000b0b2002200d370300200220033703080b200841ff0171220841044b200841054620077120044201835071732009420052200a417f73722004200351717221080b2005200b6a210741112105024020042008ad4201837c220342ffff83fea6dee111560d0041102105200342ffff99a6eaafe301560d00410f2105200342ffffe883b1de16560d00410e2105200342ffbfcaf384a302560d00410d2105200342ff9f94a58d1d560d00410c2105200342ffcfdbc3f402560d00410b2105200342ffc7afa025560d00410a2105200342ff93ebdc03560d0041092105200342ffc1d72f560d0041082105200342fface204560d0041072105200342bf843d560d00410621052003429f8d06560d00410521052003428fce00560d0041042105200342e707560d0041032105200342e300560d004102410120034209561b21050b200520076a2108024020074100480d00200841114e0d0020032001200520066a6a1057200120066a210702400340200541ffffffff07460d01200520084e0d01200720056a41303a0000200541016a21050c000b0b2001200820066a22056a41aee0003b0000200541026a21050c010b02402008417f6a220741104f0d00200320012005200641016a22076a22056a1057200120066a200120076a20081096011a2001200820066a6a412e3a00000c010b0240200841046a41044b0d00200120066a220a41b0dc003b000041022107410220086b210802400340200741ffffffff07460d01200720084e0d01200a20076a41303a0000200741016a21070c000b0b20032001200520066a20086a22056a10570c010b024020054101470d00200120066a220541016a41e5003a000020052003a741306a3a000020072001200641027222056a105820056a21050c010b20032001200520066a22056a41016a22081057200120066a220a41016a22062d0000210b2006412e3a0000200a200b3a0000200841e5003a000020072001200541026a22056a105820056a21050b200241106a240020050ba20101047f200128020022022103200128020422042105024003402005450d012005417f6a210520032802980321030c000b0b0240034020022f010621052004450d012004417f6a2104200220054102746a4198036a28020021020c000b0b2000410036020020002003360204200020013602082000420037020c200041146a2002360200200041186a20013602002000411c6a2005360200200020012802083602200bf80203047f017e017f024002400240024020012802202202450d00200141206a2002417f6a360200200128020c2203200128020422042f01064f0d01200341016a210520042003410c6c6a41086a21022004200341186c6a4190016a21040c020b410021020c020b20012802082103200128020021050240024020042802002202450d00200541016a210520043301044220862003ad8421060c010b2003ad2106410021020b024003402006422088a72207200222042f0106490d014100210220042802002203450d002004330104422086200642ffffffff0f83842106200541016a2105200321020c000b0b410120056b2102200420074102746a419c036a210302400340200328020021032002450d01200241016a210220034198036a21030c000b0b4100210520014100360200200141046a2003360200200141086a20063e020020042007410c6c6a41086a21022004200741186c6a4190016a21040b2001410c6a20053602000b20002004360204200020023602000b3101017e200029020021010240411410222200450d0020002001370204200041013602002000420037020c20000f0b00000b4701017f024020002d00004102490d00200041046a22012802002200280200200028020428020011000002402000280204280204450d002000280200101f0b2001280200101f0b0bbf0701057f200041786a22012000417c6a280200220241787122006a21030240024020024101710d002002410371450d012001280200220220006a210002400240024041002802bc9341200120026b2201460d00200241ff014b0d01200128020c220420012802082205460d022005200436020c200420053602080c030b20032802044103714103470d02410020003602b49341200341046a22032003280200417e7136020020012000410172360204200120006a20003602000f0b200110600c010b410041002802a49041417e200241037677713602a490410b024002400240024002400240024002400240200328020422024102710d0041002802c093412003460d0141002802bc93412003460d022002417871220420006a2100200441ff014b0d03200328020c220420032802082203460d042003200436020c200420033602080c050b200341046a2002417e7136020020012000410172360204200120006a20003602000c070b410020013602c09341410041002802b8934120006a22003602b89341200120004101723602040240200141002802bc9341470d00410041003602b49341410041003602bc93410b41002802dc9341220220004f0d0741002802c093412200450d07024041002802b8934122044129490d0041cc93c1002101034002402001280200220320004b0d00200320012802046a20004b0d020b200128020822010d000b0b41002802d493412200450d04410021010340200141016a2101200028020822000d000b200141ff1f200141ff1f4b1b21010c050b410020013602bc9341410041002802b4934120006a22003602b4934120012000410172360204200120006a20003602000f0b200310600c010b410041002802a49041417e200241037677713602a490410b20012000410172360204200120006a2000360200200141002802bc9341470d02410020003602b493410f0b41ff1f21010b410020013602e49341200420024d0d014100417f3602dc93410f0b02400240024002400240200041ff014b0d002000410376220341037441ac90c1006a210041002802a49041220241012003411f7174220371450d01200041086a2102200028020821030c020b200120001061410041002802e49341417f6a22013602e4934120010d0441002802d493412200450d02410021010340200141016a2101200028020822000d000b200141ff1f200141ff1f4b1b21010c030b410020022003723602a49041200041086a2102200021030b200220013602002003200136020c2001200036020c200120033602080f0b41ff1f21010b410020013602e493410b0bac0901067f230041f0006b220424002004200336020c20042002360208410121052001210602402001418102490d00410020016b21074180022108024003400240200820014f0d00200020086a2c000041bf7f4a0d020b2008417f6a21064100210520084101460d02200720086a21092006210820094101470d000c020b0b41002105200821060b200420063602142004200036021020044100410520051b36021c2004418cfcc00041dde8c00020051b360218024002400240024002400240200220014b22080d00200320014b0d00200220034b0d04024002402002450d0020012002460d00200120024d0d01200020026a2c00004140480d010b200321020b200420023602202002450d0120022001460d01200141016a2109024003400240200220014f0d00200020026a22062c000041bf7f4a0d020b2002417f6a210820024101460d0420092002462106200821022006450d000c040b0b200221080c030b20042002200320081b360228200441c8006a410c6a4101360200200441c8006a41146a4101360200200441306a410c6a4103360200200441306a41146a41033602002004410236024c2004418880c10036023020044103360234200441e4e8c0003602382004200441286a3602482004200441106a3602502004200441186a3602582004200441c8006a360240200441306a41a080c1001043000b200221080b200020086a21060b2006200020016a2202460d0141012101410021090240024020062c000022064100480d002004200641ff01713602240c010b200221010240200020086a220041016a2002460d00200041026a2101200041016a2d0000413f7121090b2006411f712100024002400240200641ff017141e001490d004100210520022107024020012002460d00200141016a210720012d0000413f7121050b20052009410674722101200641ff017141f001490d0141002106024020072002460d0020072d0000413f7121060b20014106742000411274418080f00071722006722202418080c400470d020c050b200920004106747221020c010b20012000410c747221020b20042002360224410121012002418001490d00410221012002418010490d0041034104200241808004491b21010b200420083602282004200120086a36022c200441c8006a410c6a4103360200200441c8006a41146a4104360200200441e4006a4101360200200441ec006a4101360200200441306a410c6a4105360200200441306a41146a41053602002004410236024c200441e080c10036023020044105360234200441e0eac0003602382004200441206a3602482004200441246a3602502004200441286a3602582004200441106a3602602004200441186a3602682004200441c8006a360240200441306a418881c1001043000b200441c8006a410c6a4102360200200441c8006a41146a4101360200200441e4006a4101360200200441306a410c6a4104360200200441306a41146a41043602002004410236024c200441b080c10036023020044104360234200441d0e9c0003602382004200441086a36024820042004410c6a3602502004200441106a3602582004200441186a3602602004200441c8006a360240200441306a41d080c1001043000b41e081c100104f000b3901017f02402001417f4c0d00024002402001450d002001102222020d0100000b410121020b20002001360204200020023602000f0b1023000b801b02097f017e0240024002400240024002400240024002400240024002400240024002400240024002400240024002400240024002400240024002400240024002400240024002400240024002400240200041f4014b0d0041002802a49041220141102000410b6a4178712000410b491b22024103762203411f712204762200410371450d012000417f7341017120036a2202410374220441b490c1006a280200220041086a210520002802082203200441ac90c1006a2204460d022003200436020c200441086a20033602000c030b41002103200041404f0d1c2000410b6a2200417871210241002802a890412206450d0941002107024020004108762200450d00411f2107200241ffffff074b0d002002412620006722006b411f7176410171411f20006b4101747221070b410020026b2103200741027441b492c1006a2802002200450d064100210420024100411920074101766b411f712007411f461b7421014100210503400240200028020441787122082002490d00200820026b220820034f0d0020082103200021052008450d060b200041146a28020022082004200820002001411d764104716a41106a2802002200471b200420081b21042001410174210120000d000b2004450d05200421000c070b200241002802b493414d0d082000450d02200020047441022004742200410020006b72712200410020006b71682203410374220541b490c1006a28020022002802082204200541ac90c1006a2205460d0a2004200536020c200541086a20043602000c0b0b41002001417e200277713602a490410b200020024103742202410372360204200020026a2200200028020441017236020420050f0b41002802a890412200450d052000410020006b716841027441b492c1006a280200220128020441787120026b21032001210420012802102200450d14410021090c150b41002103200021050c020b20050d020b4100210541022007411f71742200410020006b722006712200450d022000410020006b716841027441b492c1006a2802002200450d020b03402000280204417871220420024f200420026b22082003497121010240200028021022040d00200041146a28020021040b2000200520011b21052008200320011b21032004210020040d000b2005450d010b41002802b4934122002002490d012003200020026b490d010b024002400240024041002802b49341220320024f0d0041002802b89341220020024d0d014100200020026b22033602b89341410041002802c09341220020026a22043602c093412004200341017236020420002002410372360204200041086a0f0b41002802bc93412100200320026b220441104f0d01410041003602bc9341410041003602b4934120002003410372360204200020036a220341046a2102200328020441017221030c020b41002103200241af80046a220441107640002200417f460d1420004110742201450d14410041002802c4934120044180807c7122086a22003602c49341410041002802c893412203200020002003491b3602c8934141002802c093412203450d0941cc93c1002100034020002802002204200028020422056a2001460d0b200028020822000d000c130b0b410020043602b493414100200020026a22013602bc934120012004410172360204200020036a200436020020024103722103200041046a21020b20022003360200200041086a0f0b200510602003410f4b0d022005200320026a2200410372360204200520006a220020002802044101723602040c0c0b41002001417e200377713602a490410b200041086a210420002002410372360204200020026a22012003410374220320026b2202410172360204200020036a200236020041002802b493412200450d032000410376220541037441ac90c1006a210341002802bc9341210041002802a49041220841012005411f7174220571450d01200328020821050c020b20052002410372360204200520026a22002003410172360204200020036a2003360200200341ff014b0d052003410376220341037441ac90c1006a210241002802a49041220441012003411f7174220371450d07200241086a2104200228020821030c080b410020082005723602a49041200321050b200341086a20003602002005200036020c2000200336020c200020053602080b410020013602bc9341410020023602b4934120040f0b0240024041002802e093412200450d00200020014d0d010b410020013602e093410b41002100410020083602d09341410020013602cc9341410041ff1f3602e49341410041003602d893410340200041b490c1006a200041ac90c1006a2203360200200041b890c1006a2003360200200041086a2200418002470d000b410020013602c093414100200841586a22003602b8934120012000410172360204200120006a4128360204410041808080013602dc93410c090b200028020c450d010c070b2000200310610c030b200120034d0d05200420034b0d05200041046a200520086a360200410041002802c093412200410f6a417871220341786a22043602c09341410041002802b8934120086a2201200041086a20036b6a22033602b8934120042003410172360204200020016a4128360204410041808080013602dc93410c060b410020042003723602a49041200241086a2104200221030b200420003602002003200036020c2000200236020c200020033602080b200541086a21030c040b410121090b034002400240024002400240024002400240024002400240024002400240024002400240024020090e0b00010204050608090a0703030b200028020441787120026b22012003200120034922011b21032000200420011b21042000220128021022000d0a410121090c110b200141146a28020022000d0a410221090c100b20041060200341104f0d0a410a21090c0f0b2004200320026a2200410372360204200420006a220020002802044101723602040c0d0b20042002410372360204200420026a22022003410172360204200220036a200336020041002802b493412200450d09410421090c0d0b2000410376220541037441ac90c1006a210141002802bc9341210041002802a49041220841012005411f7174220571450d09410521090c0c0b200128020821050c090b410020082005723602a4904120012105410621090c0a0b200141086a20003602002005200036020c2000200136020c20002005360208410721090c090b410020023602bc9341410020033602b49341410821090c080b200441086a0f0b410021090c060b410021090c050b410321090c040b410721090c030b410921090c020b410621090c010b410821090c000b0b410041002802e093412200200120002001491b3602e09341200120086a210441cc93c100210002400240024002400240034020002802002004460d01200028020822000d000c020b0b200028020c450d010b41cc93c10021000240034002402000280200220420034b0d00200420002802046a220420034b0d020b200028020821000c000b0b410020013602c093414100200841586a22003602b8934120012000410172360204200120006a4128360204410041808080013602dc93412003200441606a41787141786a22002000200341106a491b2205411b36020441002902cc9341210a200541106a41002902d493413702002005200a370208410020083602d09341410020013602cc93414100200541086a3602d49341410041003602d893412005411c6a21000340200041073602002004200041046a22004b0d000b20052003460d0320052005280204417e713602042003200520036b2200410172360204200520003602000240200041ff014b0d002000410376220441037441ac90c1006a210041002802a49041220141012004411f7174220471450d02200028020821040c030b2003200010610c030b200020013602002000200028020420086a36020420012002410372360204200120026a2100200420016b20026b210241002802c093412004460d0441002802bc93412004460d05200428020422034103714101470d092003417871220541ff014b0d06200428020c220820042802082207460d072007200836020c200820073602080c080b410020012004723602a49041200021040b200041086a20033602002004200336020c2003200036020c200320043602080b4100210341002802b89341220020024d0d004100200020026b22033602b89341410041002802c09341220020026a22043602c093412004200341017236020420002002410372360204200041086a0f0b20030f0b410020003602c09341410041002802b8934120026a22023602b89341200020024101723602040c050b410020003602bc9341410041002802b4934120026a22023602b4934120002002410172360204200020026a20023602000c040b200410600c010b410041002802a49041417e200341037677713602a490410b200520026a2102200420056a21040b20042004280204417e7136020420002002410172360204200020026a2002360200024002400240200241ff014b0d002002410376220341037441ac90c1006a210241002802a49041220441012003411f7174220371450d01200241086a2104200228020821030c020b2000200210610c020b410020042003723602a49041200241086a2104200221030b200420003602002003200036020c2000200236020c200020033602080b200141086a0b05001024000b0a0041b0ffc000104f000b140002402000280204450d002000280200101f0b0b6c01027f410121010240024002400240410028029890414101470d004100410028029c904141016a220136029c904120014103490d010c020b410042818080801037039890410b41002802a090412202417f4c0d00410020023602a0904120014102490d010b00000b105e000b100020012000280200200028020410280bb90a010c7f230041106b220324002000280210210402400240024002400240024002400240024002400240200028020822054101470d0020040d010c080b2004450d010b2002450d01200120026a2106200041146a2802002107200141016a21044100210820012c0000220941004e0d042006210a024020024101460d00200141016a2d0000413f712108200141026a2204210a0b200941ff017141e001490d04200a2006460d02200a2d0000413f71210b200a41016a2204210a0c030b2000280218200120022000411c6a28020028020c11010021040c070b4100210220050d040c050b4100210b2006210a0b200941ff017141f001490d002009411f71210c200b200841067472210802400240200a2006460d00200a41016a2104200a2d0000413f7121090c010b410021090b2008410674200c411274418080f0007172200972418080c400460d010b02400240024002402007450d00200420016b2109034020092108200620042209460d05200941016a2104024020092c0000220a41004e0d000240024020042006460d0020042d0000413f71210d200941026a220b21040c010b4100210d2006210b0b200a41ff0171220c41e001490d0002400240200b2006460d00200b2d0000413f71210e200b41016a2204210b200c41f0014f0d010c020b4100210e2006210b200c41f001490d010b200a411f71210a200e200d41067472210c02400240200b2006460d00200b41016a2104200b2d0000413f71210b0c010b4100210b0b200c410674200a411274418080f0007172200b72418080c400460d060b200820096b20046a21092007417f6a22070d000b2008450d020c010b410021084100450d010b20082002460d0041002104200820024f0d01200120086a2c00004140480d010b200121040b2008200220041b21022004200120041b21010b2005450d010b4100210902402002450d0020022108200121040340200920042d000041c00171418001466a2109200441016a21042008417f6a22080d000b0b0240024002400240200220096b2000410c6a28020022074f0d004100210902402002450d004100210920022108200121040340200920042d000041c00171418001466a2109200441016a21042008417f6a22080d000b0b200920026b20076a2108410020002d0030220420044103461b4103712204450d0120044102460d02410021070c030b2000280218200120022000411c6a28020028020c11010021040c040b20082107410021080c010b200841016a4101762107200841017621080b2003410036020c024002402000280204220441ff004b0d00200320043a000c410121090c010b0240200441ff0f4b0d0020032004413f71418001723a000d20032004410676411f7141c001723a000c410221090c010b0240200441ffff034b0d0020032004413f71418001723a000e20032004410676413f71418001723a000d20032004410c76410f7141e001723a000c410321090c010b2003200441127641f001723a000c20032004413f71418001723a000f20032004410c76413f71418001723a000d20032004410676413f71418001723a000e410421090b417f21040240024002400340200441016a220420084f0d01200041186a2802002003410c6a20092000411c6a28020028020c110100450d000c020b0b200041186a2208280200200120022000411c6a220028020028020c1101000d00417f21040340200441016a220420074f0d0220082802002003410c6a2009200028020028020c110100450d000b0b410121040c020b410021040c010b2000280218200120022000411c6a28020028020c11010021040b200341106a240020040b7e01027f024020002802042202200028020822036b20014f0d0002400240200320016a22012003490d0020024101742203200120012003491b22014100480d00024002402002450d0020002802002001102a2202450d010c030b20014101102b22020d020b00000b1024000b20002002360200200041046a20013602000b0be60501087f4100210202400240024002400240200141bf7f4b0d0041102001410b6a4178712001410b491b21032000417c6a220428020022054178712106024002400240024002402005410371450d00200041786a220720066a2108200620034f0d0141002802c093412008460d0241002802bc93412008460d03200828020422054102710d042005417871220920066a22062003490d04200620036b2101200941ff014b0d07200828020c220220082802082208460d082008200236020c200220083602080c090b2003418002490d0320062003410472490d03200620036b418180084f0d0320000f0b0240200620036b220141104f0d0020000f0b20042003200541017172410272360200200720036a220220014103723602042008200828020441017236020420022001106220000f0b41002802b8934120066a220620034d0d0120042003200541017172410272360200200720036a2201200620036b2202410172360204410020023602b89341410020013602c0934120000f0b41002802b4934120066a220620034f0d020b200110222203450d00200320002001200428020022024178714104410820024103711b6b2202200220014b1b10950121012000101f200121020b20020f0b02400240200620036b220141104f0d0020042005410171200672410272360200200720066a2201200128020441017236020441002101410021020c010b20042003200541017172410272360200200720036a22022001410172360204200720066a2203200136020020032003280204417e713602040b410020023602bc9341410020013602b4934120000f0b200810600c010b410041002802a49041417e200541037677713602a490410b02402001410f4b0d0020042006200428020041017172410272360200200720066a2201200128020441017236020420000f0b20042003200428020041017172410272360200200720036a22022001410372360204200720066a2203200328020441017236020420022001106220000bfb0201057f02400240024002400240200141084d0d0041002102414020014110200141104b1b22016b20004d0d04200141102000410b6a4178712000410b491b22036a410c6a10222200450d04200041786a21022001417f6a2204200071450d012000417c6a22052802002206417871200420006a410020016b7141786a2200200020016a200020026b41104b1b220120026b22006b21042006410371450d0220012004200128020441017172410272360204200120046a2204200428020441017236020420052000200528020041017172410272360200200120012802044101723602042002200010620c030b200010220f0b200221010c010b20022802002102200120043602042001200220006a3602000b024020012802042200410371450d0020004178712202200341106a4d0d00200141046a2003200041017172410272360200200120036a2200200220036b2203410372360204200120026a220220022802044101723602042000200310620b200141086a21020b20020b7c01027f024020002802042202200028020822036b20014f0d0002400240200320016a22012003490d0020024101742203200120012003491b22014100480d00024002402002450d0020002802002001102a2202450d010c030b2001102222020d020b00000b1024000b20002002360200200041046a20013602000b0b2901017f20002002102c20002000280208220320026a360208200320002802006a200120021095011a0b0e0002402001450d002000101f0b0b39000240024020022001490d0020042002490d012000200220016b3602042000200320016a3602000f0b200120021030000b200220041031000b890101017f230041306b220224002002200136020420022000360200200241206a410c6a4102360200200241086a410c6a41023602002002411c6a410236020020024102360224200241e8ffc0003602082002410236020c20024194fbc000360210200220023602202002200241046a3602282002200241206a360218200241086a41f8ffc0001043000b890101017f230041306b220224002002200136020420022000360200200241206a410c6a4102360200200241086a410c6a41023602002002411c6a410236020020024102360224200241c8ffc0003602082002410236020c20024194fbc000360210200220023602202002200241046a3602282002200241206a360218200241086a41d8ffc0001043000b8c0301017f230041106b2202240002400240024002400240024020002d0000417f6a220041044b0d00024020000e050002030405000b20022001280218419782c000410a2001411c6a28020028020c1101003a00082002200136020020024100360204200241003a00090c050b20022001280218418c82c000410b2001411c6a28020028020c1101003a00082002200136020020024100360204200241003a00090c040b2002200128021841a182c000410a2001411c6a28020028020c1101003a00082002200136020020024100360204200241003a00090c030b2002200128021841ab82c000410d2001411c6a28020028020c1101003a00082002200136020020024100360204200241003a00090c020b2002200128021841b882c000410e2001411c6a28020028020c1101003a00082002200136020020024100360204200241003a00090c010b2002200128021841c682c00041052001411c6a28020028020c1101003a00082002200136020020024100360204200241003a00090b200210332101200241106a240020010bd30101037f20002d00082101024020002802042202450d00200141ff0171210341012101024020030d000240200028020022032d0000410471450d004101210120032802184193eec00041012003411c6a28020028020c1101000d01200041046a28020021020b024020024101470d0020002d0009450d00410121012000280200220328021841eafdc00041012003411c6a28020028020c1101000d010b20002802002201280218419aeec00041012001411c6a28020028020c11010021010b200041086a20013a00000b200141ff01714100470b0a004188fec0001026000b6202037f017e200128020821022001280200210302400240200128020422012802002204450d00200341016a210320013301044220862002ad8421050c010b2002ad2105410021040b2001101f2000200436020420002003360200200020053702080b6202037f017e200128020821022001280200210302400240200128020422012802002204450d00200341016a210320013301044220862002ad8421050c010b2002ad2105410021040b2001101f2000200436020420002003360200200020053702080b7e01027f024020002802042202200028020822036b20014f0d0002400240200320016a22012003490d0020024101742203200120012003491b22014100480d00024002402002450d0020002802002001102a2202450d010c030b20014101102b22020d020b00000b1024000b20002002360200200041046a20013602000b0b7501027f200028020841186c210120002802002100024003402001450d01024020002d000022024107714103490d000240024020024104460d0020024103470d01200041046a10390c020b200041046a220210382002103a0c010b200041046a103b0b200041186a2100200141686a21010c000b0b0b140002402000280204450d002000280200101f0b0b140002402000280204450d002000280200101f0b0ba307010b7f23004190016b22012400200028020821022000280204210302400340200028020021002003450d0120004198036a21002003417f6a21030c000b0b200141e8006a41106a210441002103410021050240024003402002450d0102400240200320002f01064f0d00200141306a41086a220620002003410c6c6a220741106a2802003602002001200741086a290200370330200141d0006a41106a22082000200341186c6a220741a0016a290300370300200141d0006a41086a220920074198016a290300370300200120074190016a290300370350200141e8006a41086a200628020036020020042001290350370300200441086a2009290300370300200441106a200829030037030020012001290330370368200141086a200141e8006a41281095011a200341016a21030c010b200141e8006a41086a220620053602002001200036026c20014100360268200141306a200141e8006a103502400340200141306a41086a280200210520012802302103200141306a410c6a2802002207200128023422002f0106490d01200620053602002001200036026c20012003360268200141306a200141e8006a10360c000b0b200141c0006a41086a220920002007410c6c6a220841106a2802003602002001200841086a290200370340200141d0006a41106a220a2000200741186c6a220841a0016a290300370300200141d0006a41086a220b20084198016a290300370300200120084190016a290300370350410120036b2103200020074102746a419c036a210002400340200028020021002003450d01200341016a210320004198036a21000c000b0b2004200129035037030020062009280200360200200441086a200b290300370300200441106a200a29030037030020012001290340370368200141086a200141e8006a41281095011a410021030b200141086a41106a2d00004106460d022002417f6a2102200141e8006a200141086a41281095011a200141e8006a10530c000b0b200141186a41063a00000b200141086a10540240200041c8d9c000460d002001200036026c2001410036026820012005360270200141086a200141e8006a1035200128020c450d00200141306a41086a2203200141086a41086a280200360200200120012903083703300340200141d0006a41086a200328020036020020012001290330370350200141e8006a200141d0006a1036200128026c450d012003200141e8006a41086a280200360200200120012903683703300c000b0b20014190016a24000b2901017f20002002103720002000280208220320026a360208200320002802006a200120021095011a0b02000b6001017f230041206b2202240020022000360204200241086a41106a200141106a290200370300200241086a41086a200141086a29020037030020022001290200370308200241046a41a8fec000200241086a103f2101200241206a240020010ba00801117f230041c0006b22032400200341086a411c6a22042001360200200341346a2205200241146a2802002206360200200341033a0038200341086a41246a220720022802102201200641037422066a36020020034280808080800437030820034100360210200341003602182003200036022020032001360228200320013602302002280204220841037421092002280200210a02400240024002400240024002400240024020022802082200450d002000411c6a210120002002410c6a28020041246c6a210b200341206a210c200341386a210d200341306a210e200341086a41146a210f200341186a2110200341286a211120092108200a210203402000200b460d022008450d04200c2802002002280200200241046a280200200428020028020c1101000d03200d20002d00203a00002003200028020836020c2003200028020c360208410021060240024002400240200028021822124101460d00024020124103460d0020124102470d02201128020022132007280200460d002011201341086a36020020132802044105470d04201328020028020021120c030b0c030b20012802002213200528020022124f0d0b200e28020020134103746a22132802044105470d02201328020028020021120c010b200128020021120b410121060b200341086a410c6a2012360200200341086a41086a2006360200410021060240024002400240200028021022124101460d00024020124103460d0020124102470d02201128020022132007280200460d002011201341086a36020020132802044105470d04201328020028020021120c030b0c030b200141786a2802002213200528020022124f0d0c200e28020020134103746a22132802044105470d02201328020028020021120c010b200141786a28020021120b410121060b200f2012360200201020063602000240024020002802004101470d00200141686a2802002206200528020022124f0d08200e28020020064103746a21060c010b201128020022062007280200460d082011200641086a3602000b200041246a2100200241086a2102200141246a2101200841786a21082006280200200341086a200641046a280200110200450d000c030b0b20084103742100200341206a2111200a210203402006450d012000450d0320112802002002280200200241046a280200200428020028020c1101000d02200641786a2106200041786a2100200241086a21022001280200210820012802042112200141086a21012008200341086a2012110200450d000c020b0b2002200a20096a460d01200341206a28020020022802002002280204200341246a28020028020c110100450d010b410121000c010b410021000b200341c0006a240020000f0b41f881c100200620121074000b41e081c100104f000b41d081c100201320121074000b41d081c100201320121074000b900101017f230041c0006b220024002000413536020c200041db84c000360208200041286a410c6a4106360200200041106a410c6a4102360200200041246a41023602002000410736022c200041b08fc1003602102000410236021420004194fbc0003602182000200041086a3602282000200041386a3602302000200041286a360220200041106a41c08fc1001043000b1c002001280218418eeec00041052001411c6a28020028020c1101000b100020012000280200200028020410280b4a02017f017e230041206b2202240020012902002103200241146a2001290208370200200241a08fc1003602042002418cfcc000360200200220003602082002200337020c2002105f000bb70201027f230041106b22022400200028020021000240024020014180014f0d000240200028020822032000280204470d00200041011037200041086a28020021030b200028020020036a20013a0000200041086a2201200128020041016a3602000c010b2002410036020c0240024020014180104f0d0020022001413f71418001723a000d20022001410676411f7141c001723a000c410221010c010b0240200141ffff034b0d0020022001413f71418001723a000e20022001410676413f71418001723a000d20022001410c76410f7141e001723a000c410321010c010b2002200141127641f001723a000c20022001413f71418001723a000f20022001410c76413f71418001723a000d20022001410676413f71418001723a000e410421010b20002002410c6a2001103c0b200241106a240041000b5801017f230041206b2202240020002802002100200241086a41106a200141106a290200370300200241086a41086a200141086a290200370300200220012902003703082000200241086a103e2101200241206a240020010b0f00200028020020012002103c41000be60b01027f230041c0006b2202240002400240024002400240024002400240024002400240024002400240024002400240024002400240024002400240024002400240024020002802002203280200417f6a220041164b0d0002400240024002400240024002400240024002400240024002400240024002400240024002400240024020000e17000102030405060708090a0b0c0d0e0f10111216131417000b20032d000422004103714101460d1720004102470d18200341086a28020022002802002001200028020428021c11020021010c2e0b2001280218419085c00041182001411c6a28020028020c11010021010c2d0b200128021841a885c000411b2001411c6a28020028020c11010021010c2c0b200128021841c385c000411a2001411c6a28020028020c11010021010c2b0b200128021841dd85c00041192001411c6a28020028020c11010021010c2a0b200128021841f685c000410c2001411c6a28020028020c11010021010c290b2001280218418286c00041132001411c6a28020028020c11010021010c280b2001280218419586c00041132001411c6a28020028020c11010021010c270b200128021841a886c00041132001411c6a28020028020c11010021010c260b200128021841bb86c000410e2001411c6a28020028020c11010021010c250b200128021841c986c000410e2001411c6a28020028020c11010021010c240b200128021841d786c000410f2001411c6a28020028020c11010021010c230b200128021841e686c000410e2001411c6a28020028020c11010021010c220b200128021841f486c000410e2001411c6a28020028020c11010021010c210b2001280218418287c00041132001411c6a28020028020c11010021010c200b2001280218419587c000411a2001411c6a28020028020c11010021010c1f0b200128021841af87c000413e2001411c6a28020028020c11010021010c1e0b200128021841ed87c00041142001411c6a28020028020c11010021010c1d0b2001280218418188c00041242001411c6a28020028020c11010021010c1c0b200128021841b388c00041132001411c6a28020028020c11010021010c1b0b200128021841c688c000411c2001411c6a28020028020c11010021010c1a0b20012802182003280204200341086a2802002001411c6a28020028020c11010021010c190b200128021841a588c000410e2001411c6a28020028020c11010021010c180b200128021841e288c00041182001411c6a28020028020c11010021010c170b41102100200341056a2d0000417f6a220341104b0d01024020030e11000304050708090a140b0c0d0e0f101113000b41e3d8c0002103411121000c150b2002200341086a280200360204200241086a41b3d9c00041141048200241186a410c6a41083602002002410936021c2001411c6a28020021002002200241086a3602182002200241046a36022020012802182101200241286a410c6a4102360200200241286a41146a41023602002002410336022c200241f8fec00036022820024194fbc0003602302002200241186a36023820012000200241286a103f2101200228020c450d152002280208101f0c150b41f4d8c00021030c130b41d1d8c00021030c020b41c1d8c00021030c110b41afd8c00021030b411221000c0f0b41a2d8c0002103410d21000c0e0b4194d8c00021030c090b41ffd7c00021030c0b0b41f4d7c0002103410b21000c0b0b41cad7c00021030c090b41b3d7c0002103411721000c090b41a7d7c0002103410c21000c080b419ed7c0002103410921000c070b4194d7c0002103410a21000c060b41ffd6c00021030c040b41f1d6c00021030b410e21000c030b41dbd6c0002103411621000c020b41dfd7c00021030b411521000b2002200036021c200220033602182002410a36020c2001411c6a28020021002002200241186a36020820012802182101200241346a41013602002002413c6a41013602002002410136022c20024190ffc00036022820024184d9c0003602302002200241086a36023820012000200241286a103f21010b200241c0006a240020010bce0101037f230041106b2203240002400240024002402002417f4c0d00024002402002450d00200210222204450d0420032004360200200341003602082003200236020420032002106321040c010b200342013703002003410036020820034100106321040b200441ff01714102470d01200341086a22042004280200220520026a360200200520032802006a200120021095011a200041086a200428020036020020002003290300370200200341106a24000f0b1064000b20044101710d011024000b00000b4198ffc000104f000bde0201077f230041306b220224004127210302400240200028020022042004411f7522006a20007322004190ce00490d00412721030340200241096a20036a2205417c6a200020004190ce006e220641f0b17f6c6a220741e4006e2208410174419edac0006a2f00003b00002005417e6a20072008419c7f6c6a410174419edac0006a2f00003b00002003417c6a2103200041ffc1d72f4b21052006210020050d000c020b0b200021060b02400240200641e400480d00200241096a2003417e6a22036a200641ffff037141e4006e2200419c7f6c20066a41ffff0371410174419edac0006a2f00003b00000c010b200621000b02400240200041094a0d00200241096a2003417f6a22036a2206200041306a3a00000c010b200241096a2003417e6a22036a22062000410174419edac0006a2f00003b00000b20012004417f73411f76418cfcc00041002006412720036b10652100200241306a240020000b100020012000280200200028020810280b100020012000280200200028020410280ba10301047f230041c0006b220224002002200028020022003602242002410036020820024201370300200241346a41013602002002413c6a41013602002002410b36021c20024190ffc0003602282002410136022c20024184d9c0003602302002200241246a3602182002200241186a360238024002402002200241286a103e0d00024020022802042203200241086a22042802002205460d0020032005490d02024002402005450d0020022802002005102a22030d0100000b2002103941002105410121030b20022005360204200220033602000b200241186a41086a2004280200360200200220022903003703182002410c6a4102360200200241146a41023602002002410c36020420022000410c6a3602082002200041106a3602102001411c6a28020021002002200241186a36020020012802182101200241286a410c6a4103360200200241286a41146a41033602002002410436022c200241c0fec000360228200241e4e8c0003602302002200236023820012000200241286a103f2101200241186a1039200241c0006a240020010f0b1040000b41e0fec000104f000bcb0201067f230041306b220224004127210302400240200028020022004190ce00490d00412721030340200241096a20036a2204417c6a200020004190ce006e220541f0b17f6c6a220641e4006e2207410174419edac0006a2f00003b00002004417e6a20062007419c7f6c6a410174419edac0006a2f00003b00002003417c6a2103200041ffc1d72f4b21042005210020040d000c020b0b200021050b02400240200541e400480d00200241096a2003417e6a22036a200541ffff037141e4006e2200419c7f6c20056a41ffff0371410174419edac0006a2f00003b00000c010b200521000b02400240200041094a0d00200241096a2003417f6a22036a2205200041306a3a00000c010b200241096a2003417e6a22036a22052000410174419edac0006a2f00003b00000b20014101418cfcc00041002005412720036b10652100200241306a240020000bf00902107f017e230041206b220224002000280208210320002802002104410121050240200128021841222001411c6a2802002802101102000d00024002402003450d00200420036a2106200141186a21072001411c6a2108200421094100210a410021002004210b0340200941016a210c0240024002400240024020092c0000220d4100480d00200d41ff0171210d0c010b02400240200c2006460d00200c2d0000413f71210e200941026a2209210c0c010b4100210e200621090b200d411f71210f024002400240200d41ff0171220d41e001490d0020092006460d0120092d0000413f712110200941016a220c21110c020b200e200f41067472210d0c020b41002110200621110b2010200e41067472210e0240200d41f001490d0020112006460d02201141016a210920112d0000413f71210d0c030b200e200f410c7472210d0b200c21090c020b4100210d200c21090b200e410674200f411274418080f0007172200d72220d418080c400460d030b4102210e0240024002400240200d4109460d000240200d410a460d0002400240200d41dc00460d00200d4122460d00200d4127460d00200d410d470d0141f200210f0c040b200d210f0c030b0240200d10500d00200d10510d050b200d41017267410276410773ad4280808080d0008421124103210e200d210f0c030b41ee00210f0c010b41f400210f0b0b20022003360204200220043602002002200a3602082002200036020c02402000200a490d000240200a450d00200a2003460d00200a20034f0d012004200a6a2c000041bf7f4c0d010b02402000450d0020002003460d00200020034f0d01200420006a2c000041bf7f4c0d010b024020072802002004200a6a2000200a6b200828020028020c1101000d0003400240024002400240024002400240200e410371220a4101460d0041dc00210c0240200a4102460d00200a4103470d062012422088a7410771417f6a220a41044b0d060240200a0e050006040503000b201242ffffffff8f6083211241fd00210c0c070b4101210e0c060b4100210e200f210c0c050b201242ffffffff8f60834280808080c0008421120c040b201242ffffffff8f608342808080802084211241fb00210c0c030b201242ffffffff8f608342808080803084211241f500210c0c020b200f2012a72211410274411c7176410f71220a413072200a41d7006a200a410a491b210c02402011450d002012427f7c42ffffffff0f832012428080808070838421120c020b201242ffffffff8f60834280808080108421120c010b4101210a0240200d418001490d004102210a200d418010490d0041034104200d41808004491b210a0b200a20006a210a0c040b2007280200200c2008280200280210110200450d000b0b410121050c050b2002200241086a3602142002200236021020022002410c6a360218200241106a1052000b2000200b6b20096a21002009210b20062009470d000c020b0b4100210a0b20022003360204200220043602002002200a3602082002200336020c02400240200a450d002003200a460d0002402003200a4d0d002004200a6a22002c000041bf7f4a0d020b2002200241086a3602142002200236021020022002410c6a360218200241106a1052000b2004200a6a21000b200141186a220d28020020002003200a6b2001411c6a220a28020028020c1101000d00200d2802004122200a28020028021011020021050b200241206a240020050b6802017f037e230041306b22012400200029021021022000290208210320002902002104200141146a410036020020012004370318200142013702042001418cfcc0003602102001200141186a36020020012003370320200120023703282001200141206a1043000b960201017f024002400240024002400240024020004180104f0d00200041037641f8ffffff017141b882c1006a21010c010b02402000418080044f0d00200041067641606a220141e0074f0d02200141d084c1006a2d0000220141c9004b0d03200141037441d0eec0006a21010c010b2000410c7641706a22014180024f0d03200141b08cc1006a2d00004106742000410676413f7172220141ff034b0d04200141a0f3c0006a2d0000220141364b0d05200141037441a0f7c0006a21010b200129030042012000413f71ad86834200520f0b41c08ec100200141e0071074000b41d08ec100200141ca001074000b41e08ec10020014180021074000b41f08ec10020014180041074000b41808fc100200141371074000bb201000240200041ffff034b0d00200041e6dbc000412841b6dcc00041af0241e5dec00041bc0210670f0b0240200041ffff074b0d00200041a1e1c000412141e3e1c000419e014181e3c00041fd0210670f0b0240200041e28b746a41e28d2c490d002000419fa8746a419f18490d00200041dee2746a410e490d00200041feffff0071419ef00a460d00200041a9b2756a4129490d00200041cb91756a410a4d0d0020004190fc476a418ffc0b4b0f0b41000b2601017f200028020022012802002001280204200028020428020020002802082802001020000b4b01017f20001055024020002d001022014107714103490d000240024020014104460d0020014103470d01200041146a10550f0b200041146a220010382000103a0f0b200041146a103b0b0b1300024020002d00104106460d00200010530b0b0600200010390b39002004200042028622004202842001200220031059370300200520002006ad427f857c2001200220031059370300200020012002200310590ba50303017f017e047f024002402000428080808010540d00200141786a220220004280c2d72f8022034280bea8507e20007ca722044190ce006e22054190ce0070220641e4006e2207410174419edac0006a2f00003b00002001417c6a200541f0b17f6c20046a220441e4006e2205410174419edac0006a2f00003b00002001417a6a20062007419c7f6c6a410174419edac0006a2f00003b00002001417e6a20042005419c7f6c6a410174419edac0006a2f00003b00000c010b20012102200021030b2002417e6a21022003a72101024003402001418fce004d0d012002417e6a20014190ce006e220441f0b17f6c20016a220141e4006e2205410174419edac0006a2f00003b0000200220012005419c7f6c6a410174419edac0006a2f00003b00002002417c6a2102200421010c000b0b02400240200141e3004d0d002002200141ffff037141e4006e2204419c7f6c20016a41ffff0371410174419edac0006a2f00003b0000200421010c010b200241026a21020b02402001410a490d002002417e6a2001410174419edac0006a2f00003b00000f0b2002417f6a200141306a3a00000ba20101027f024002402000417f4c0d00200021020c010b2001412d3a0000410020006b2102200141016a21010b0240200241e3004c0d002001200241e4006e220341306a3a0000200120022003419c7f6c6a410174419edac0006a2f00003b00012000411f7641036a0f0b0240200241094c0d0020012002410174419edac0006a2f00003b00002000411f764102720f0b2001200241306a3a00002000411f7641016a0b7301017f230041306b22042400200441206a2001420020004200109801200441106a20024200200042001098012004200441206a41086a290300220020042903107c2202200441106a41086a2903002002200054ad7c200341c0006a41ff0071109b0120042903002100200441306a240020000b890101017f230041306b220124002001412b360204200141b6fdc000360200200141206a410c6a410d360200200141086a410c6a41023602002001411c6a41023602002001410736022420012000360228200141b08fc1003602082001410236020c20014194fbc000360210200120013602202001200141206a360218200141086a41c08fc1001043000be30101017f230041106b2202240020022001280218419eedc00041092001411c6a28020028020c1101003a000420022001360200200241003a00052002200036020c200241a7edc000410b2002410c6a419881c100106c21012002200041046a36020c200141b2edc00041092002410c6a41a881c100106c1a20022d00042101024020022d0005450d00200141ff0171210041012101024020000d00200228020022012802184195eec0004197eec00020012802004104711b41022001411c6a28020028020c11010021010b200220013a00040b200241106a2400200141ff01714100470b3101017f230041106b220124002000280208105d1a2001200029020c3703002001200041146a29020037030820011026000b150002402000450d0020000f0b41e081c100104f000b040000000b07002000105c000bd10201057f200028021821010240024002400240200028020c22022000460d0020002802082203200236020c2002200336020820010d010c020b0240200041144110200041146a220228020022041b6a2802002203450d002002200041106a20041b2104024003402004210502402003220241146a22042802002203450d0020030d010c020b200241106a2104200228021022030d000b0b2005410036020020010d010c020b410021022001450d010b02400240200028021c41027441b492c1006a22032802002000460d0020014110411420012802102000461b6a200236020020020d010c020b200320023602002002450d020b20022001360218024020002802102203450d0020022003360210200320023602180b200041146a2802002203450d00200241146a2003360200200320023602180b0f0b410041002802a89041417e2000411c6a28020077713602a890410bc40201047f41002102024020014108762203450d00411f2102200141ffffff074b0d002001412620036722026b411f7176410171411f20026b4101747221020b2000200236021c20004200370210200241027441b492c1006a21030240024002400240024041002802a89041220441012002411f7174220571450d00200328020022042802044178712001470d01200421020c020b410020042005723602a8904120032000360200200020033602180c030b20014100411920024101766b411f712002411f461b742103034020042003411d764104716a41106a22052802002202450d02200341017421032002210420022802044178712001470d000b0b20022802082203200036020c200220003602082000200236020c20002003360208200041003602180f0b20052000360200200020043602180b2000200036020c200020003602080b960501047f200020016a210202400240024002400240024002400240200028020422034101710d002003410371450d012000280200220320016a210102400240024041002802bc9341200020036b2200460d00200341ff014b0d01200028020c220420002802082205460d022005200436020c200420053602080c030b20022802044103714103470d02410020013602b49341200241046a22032003280200417e7136020020002001410172360204200220013602000f0b200010600c010b410041002802a49041417e200341037677713602a490410b02400240200228020422034102710d0041002802c093412002460d0141002802bc93412002460d032003417871220420016a2101200441ff014b0d04200228020c220420022802082202460d062002200436020c200420023602080c070b200241046a2003417e7136020020002001410172360204200020016a20013602000c070b410020003602c09341410041002802b8934120016a22013602b8934120002001410172360204200041002802bc9341460d030b0f0b410020003602bc9341410041002802b4934120016a22013602b4934120002001410172360204200020016a20013602000f0b200210600c020b410041003602b49341410041003602bc93410f0b410041002802a49041417e200341037677713602a490410b20002001410172360204200020016a2001360200200041002802bc9341470d00410020013602b493410f0b024002400240200141ff014b0d002001410376220241037441ac90c1006a210141002802a49041220341012002411f7174220271450d01200128020821020c020b2000200110610f0b410020032002723602a49041200121020b200141086a20003602002002200036020c2000200136020c200020023602080b7001037f4102210202402000280204220320014f0d0041002102200341017422042001200420014b1b22014100480d000240024002402003450d0020002802002001102a2202450d010c020b2001102222020d010b00000b20002002360200200041046a2001360200410221020b20020b05001024000b800a01047f230041206b2206240020062003360204200620023602002006418080c4003602080240024002402001450d00200028020022074101710d01200521080c020b2006412d360208200541016a2108200028020021070c010b2006412b360208200541016a21080b41002101200641003a000f02402007410471450d00200641013a000f02402003450d0041002101200321090340200120022d000041c00171418001466a2101200241016a21022009417f6a22090d000b0b200820036a20016b21080b2000280208210220062006410f6a3602142006200641086a36021020062006360218024002400240024002400240024002400240024002400240024002400240024020024101470d002000410c6a280200220220084d0d0120074108710d02200220086b2109410120002d0030220220024103461b4103712202450d0420024102460d03410021030c050b200641106a200010750d0c2000280218200420052000411c6a28020028020c11010021020c0e0b200641106a200010750d0b2000280218200420052000411c6a28020028020c11010021020c0d0b200041013a003020004130360204200641106a200010750d0a200220086b21094101200041306a2d0000220220024103461b4103712202450d0420024102460d03410021030c050b200941016a4101762103200941017621090c010b20092103410021090b2006410036021c02402000280204220241ff004b0d00200620023a001c410121010c050b0240200241ff0f4b0d0020062002413f71418001723a001d20062002410676411f7141c001723a001c410221010c050b200241ffff034b0d0320062002413f71418001723a001e20062002410676413f71418001723a001d20062002410c76410f7141e001723a001c410321010c040b200941016a4101762103200941017621090c010b20092103410021090b2006410036021c0240200041046a280200220241ff004b0d00200620023a001c410121010c040b200241ff0f4b0d0220062002413f71418001723a001d20062002410676411f7141c001723a001c410221010c030b2006200241127641f001723a001c20062002413f71418001723a001f20062002410c76413f71418001723a001d20062002410676413f71418001723a001e410421010b417f210202400340200241016a220220094f0d01200041186a2802002006411c6a20012000411c6a28020028020c110100450d000c040b0b200641106a200010750d02200041186a2209280200200420052000411c6a220028020028020c1101000d02417f21020340200241016a220220034f0d0420092802002006411c6a2001200028020028020c110100450d000c030b0b0240200241ffff034b0d0020062002413f71418001723a001e20062002410676413f71418001723a001d20062002410c76410f7141e001723a001c410321010c010b2006200241127641f001723a001c20062002413f71418001723a001f20062002410c76413f71418001723a001d20062002410676413f71418001723a001e410421010b417f210202400340200241016a220220094f0d01200041186a2802002006411c6a20012000411c6a28020028020c110100450d000c020b0b200041186a2209280200200420052000411c6a220028020028020c1101000d00417f21020340200241016a220220034f0d0220092802002006411c6a2001200028020028020c110100450d000b0b410121020c010b410021020b200641206a240020020bc30501077f410021040240024020024103712205450d00410420056b2205450d00200220032005200520034b1b22046a210641002105200141ff017121072004210820022109024002400340200620096b41034d0d01200520092d0000220a2007476a2105200a2007460d022005200941016a2d0000220a2007476a2105200a2007460d022005200941026a2d0000220a2007476a2105200a2007460d022005200941036a2d0000220a2007476a21052008417c6a2108200941046a2109200a2007470d000c020b0b41002107200141ff0171210603402008450d02200920076a210a2008417f6a2108200741016a2107200a2d0000220a2006470d000b200a200141ff01714641016a41017120056a20076a417f6a21050b410121090c010b200141ff017121070240024020034108490d002004200341786a220a4b0d00200741818284086c210502400340200220046a220941046a2802002005732208417f73200841fffdfb776a7120092802002005732209417f73200941fffdfb776a7172418081828478710d01200441086a2204200a4d0d000b0b200420034b0d010b200220046a2109200220036a2102200320046b2108410021050240024002400340200220096b41034d0d01200520092d0000220a2007476a2105200a2007460d022005200941016a2d0000220a2007476a2105200a2007460d022005200941026a2d0000220a2007476a2105200a2007460d022005200941036a2d0000220a2007476a21052008417c6a2108200941046a2109200a2007470d000c020b0b41002107200141ff0171210203402008450d02200920076a210a2008417f6a2108200741016a2107200a2d0000220a2002470d000b200a200141ff01714641016a41017120056a20076a417f6a21050b41012109200520046a21050c020b41002109200520076a20046a21050c010b200420031030000b20002005360204200020093602000be20201067f200120024101746a210720004180fe0371410876210841002109200041ff0171210a0240024002400240024002400340200141026a210b200920012d000122026a210c0240024020012d000022012008470d00200c2009490d06200c20044b0d07200320096a210103402002450d022002417f6a210220012d00002109200141016a21012009200a470d000c050b0b200120084b0d02200c2109200b2101200b2007470d010c020b200c2109200b2101200b2007470d000b0b200041ffff0371210a200541016a2101200520066a210c4101210203400240024020052d00002209411874411875220b417f4c0d00200121050c010b2001200c460d06200141016a2105200b41ff007141087420012d00007221090b200a20096b220a4100480d02200541016a2101200241017321022005200c470d000c020b0b410021020b20024101710f0b2009200c1030000b200c20041031000b41e081c100104f000b100020012000280200200028020410280bd20403037f017e027f410121020240200128021841272001411c6a2802002802101102000d004102210302400240024002400240024002400240024002402000280200220241776a2200411e4b0d0041f4002104024020000e1f0a0002020302020202020202020202020202020202020202020602020202060a0b41ee0021040c030b200241dc00460d040b20021050450d02200241017267410276410773ad4280808080d0008421050c050b41f20021040b0c050b20021051450d01410121030b0c020b200241017267410276410773ad4280808080d0008421050b410321030b200221040b200141186a21002001411c6a21060340024002400240024002400240024002400240200341037122024101460d0020024102460d0120024103470d072005422088a7410771417f6a220241044b0d07024020020e050003040506000b200542ffffffff8f6083210541fd0021020c080b41002103200421020c070b41dc002102410121030c060b20042005a72207410274411c7176410f712202413072200241d7006a2002410a491b21022007450d032005427f7c42ffffffff0f832005428080808070838421050c050b200542ffffffff8f608342808080802084210541fb0021020c040b200542ffffffff8f608342808080803084210541f50021020c030b200542ffffffff8f60834280808080c00084210541dc0021020c020b200542ffffffff8f60834280808080108421050c010b200141186a28020041272001411c6a28020028021011020021020c020b200028020020022006280200280210110200450d000b41010f0b20020b950101017f230041306b22022400200241086a410c6a410e3602002002410e36020c200220003602082002200041046a3602102001411c6a280200210020012802182101200241186a410c6a41023602002002412c6a41023602002002410236021c200241b08ec10036021820024194fbc0003602202002200241086a36022820012000200241186a103f2101200241306a240020010b02000bbb0403027f017e037f230041e0006b220524002005200236020c200520013602080240024020002d00040d00200541eafdc000419feec00020002d000522011b220236021020054101410220011b22063602140240200028020022012d00004104710d00200541d0006a410c6a4101360200200541013602542001411c6a28020021022005200541106a3602502005200541086a36025820012802182101200541186a410c6a41023602002005412c6a41023602002005410336021c200541a082c10036021820054194fbc0003602202005200541d0006a36022820012002200541186a103f0d0120032000280200200428020c11020021010c020b200541003a00582005200129021837035020012902002107200541186a410c6a2001410c6a280200360200200541186a41146a200141146a280200360200200520012d00303a00482005200737031820052001280208360220200520012802103602282001412c6a2802002108200141246a28020021092005200541d0006a3602302001280228210a20012802202101200541346a41b881c10036020020052001360238200541186a41246a20093602002005200a360240200541186a412c6a2008360200200541d0006a20022006106f0d00200541d0006a4193eec0004101106f0d00200541d0006a2005280208200528020c106f0d00200541d0006a41edfbc0004102106f0d002003200541186a200428020c11020021010c010b410121010b200041056a41013a0000200041046a20013a0000200541e0006a240020000b02000b0d00200028020020012002106f0b9605010d7f230041c0006b22032400024002400240024002402002450d00200341386a2104200041086a21052003412c6a2106200341306a2107200341346a2108200041046a21090340024020052d0000450d002000280200419beec0004104200928020028020c1101000d030b200341206a41086a220a4100360200200620023602002007428a808080103703002004410a3602002003200236022420032001360220200341086a410a2001200210660240024002400240024020032802084101470d00200328020c210b0340200a200b200a2802006a41016a220b36020002400240200b2008280200220c4f0d002003280224210d0c010b2003280224220d200b490d00200c41054f0d052003280220200b200c6b220e6a220f2004460d04200f2004200c109701450d040b2006280200220f200b490d02200d200f490d022003200341206a200c6a41176a2d00002003280220200b6a200f200b6b10662003280204210b20032802004101460d000b0b200a20062802003602000b200541003a00002002210b0c020b200541013a0000200e41016a210b0c010b200c41041031000b2009280200210f2000280200210c20032001360220200320023602240240200b452002200b4672220a0d002002200b4d0d052001200b6a2c000041bf7f4c0d050b200c2001200b200f28020c1101000d0220032002360214200320013602102003200b3602182003200236021c0240200a450d002001200b6a21012002200b6b22020d010c020b2002200b4d0d052001200b6a22012c000041bf7f4c0d052002200b6b22020d000b0b4100210b0c010b4101210b0b200341c0006a2400200b0f0b200341206a200b1079000b2003200341186a3602242003200341106a36022020032003411c6a360228200341206a107a000b0b002000280200200110710bf90101017f230041106b220224002002410036020c02400240200141ff004b0d00200220013a000c410121010c010b0240200141ff0f4b0d0020022001413f71418001723a000d20022001410676411f7141c001723a000c410221010c010b0240200141ffff034b0d0020022001413f71418001723a000e20022001410676413f71418001723a000d20022001410c76410f7141e001723a000c410321010c010b2002200141127641f001723a000c20022001413f71418001723a000f20022001410c76413f71418001723a000d20022001410676413f71418001723a000e410421010b20002002410c6a2001106f2101200241106a240020010b6301017f230041206b2202240020022000280200360204200241086a41106a200141106a290200370300200241086a41086a200141086a29020037030020022001290200370308200241046a418882c100200241086a103f2101200241206a240020010b080020002001104d0b860101017f230041306b220324002003200236020420032001360200200341206a410c6a4102360200200341086a410c6a41023602002003411c6a410236020020034102360224200341908fc1003602082003410236020c20034194fbc0003602102003200341046a360220200320033602282003200341206a360218200341086a20001043000be40201057f230041106b220224000240024020002802002802002203418080c400460d002001411c6a2802002104200128021821052002410036020c02400240200341ff004b0d00200220033a000c410121060c010b0240200341ff0f4b0d0020022003413f71418001723a000d20022003410676411f7141c001723a000c410221060c010b0240200341ffff034b0d0020022003413f71418001723a000e20022003410676413f71418001723a000d20022003410c76410f7141e001723a000c410321060c010b2002200341127641f001723a000c20022003413f71418001723a000f20022003410c76413f71418001723a000d20022003410676413f71418001723a000e410421060b4101210320052002410c6a2006200428020c1101000d010b024020002802042d0000450d0020012802182000280208220028020020002802042001411c6a28020028020c11010021030c010b410021030b200241106a240020030bb30201037f23004180016b220224002000280200210002400240024002400240200128020022034110710d0020034120710d0120002001104d21000c020b20002802002103410021000340200220006a41ff006a2003410f712204413072200441d7006a2004410a491b3a00002000417f6a2100200341047622030d000b20004180016a22034181014f0d0220014101419cdac0004102200220006a4180016a410020006b106521000c010b20002802002103410021000340200220006a41ff006a2003410f712204413072200441376a2004410a491b3a00002000417f6a2100200341047622030d000b20004180016a22034181014f0d0220014101419cdac0004102200220006a4180016a410020006b106521000b20024180016a240020000f0b20034180011030000b20034180011030000bc30301037f23004180016b22022400024002400240024002400240024002400240200128020022034110710d0020002d0000210020034120710d01200041e400490d0220022000200041e4006e2204419c7f6c6a41ff0171410174419edac0006a2f00003b0025412521030c030b20002d00002103410021000340200220006a41ff006a2003410f712204413072200441d7006a2004410a491b3a00002000417f6a21002003410476410f7122030d000b20004180016a22034181014f0d0620014101419cdac0004102200220006a4180016a410020006b106521000c050b410021030340200220036a41ff006a2000410f712204413072200441376a2004410a491b3a00002003417f6a21032000410476410f7122000d000b20034180016a22004181014f0d0620014101419cdac0004102200220036a4180016a410020036b106521000c040b41272103200041094b0d01200021040b200220036a417f6a2200200441306a3a0000412820036b21030c010b20022000410174419edac0006a2f00003b0025200241256a2100410221030b20014101418cfcc000410020002003106521000b20024180016a240020000f0b20034180011030000b20004180011030000b02000b130020002802002000280204410020011020000b2601017f200028020022012802002001280204200028020428020020002802082802001020000b6001017f230041206b2202240020022000360204200241086a41106a200141106a290200370300200241086a41086a200141086a29020037030020022001290200370308200241046a418882c100200241086a103f2101200241206a240020010bac0201037f23004180016b2202240002400240024002400240200128020022034110710d0020034120710d0120002001104d21000c020b20002802002103410021000340200220006a41ff006a2003410f712204413072200441d7006a2004410a491b3a00002000417f6a2100200341047622030d000b20004180016a22034181014f0d0220014101419cdac0004102200220006a4180016a410020006b106521000c010b20002802002103410021000340200220006a41ff006a2003410f712204413072200441376a2004410a491b3a00002000417f6a2100200341047622030d000b20004180016a22034181014f0d0220014101419cdac0004102200220006a4180016a410020006b106521000b20024180016a240020000f0b20034180011030000b20034180011030000b02000b0c0042eac3fccee49daadc020bd10301047f230041d0006b22022400410121030240024002400240200028020022002d00004101470d0020012802184190fbc00041042001411c6a28020028020c1101000d03200041016a2100200128020022034104710d0141012103200141186a22042802004199eec00041012001411c6a220528020028020c1101000d032004280200418cfcc0004100200528020028020c1101000d032000200110770d030c020b2001280218418cfbc00041042001411c6a28020028020c11010021030c020b200241346a41b881c100360200200241186a410c6a2001410c6a290200370200200241186a41146a200141146a280200360200200241003a0010200220033602182002200141186a290200370308200220012d00303a00482002200129020437021c20022001290228370340200220012902203703382002200241086a36023041012103200241086a4199eec0004101106f0d01200241086a4193eec0004101106f0d01410121032000200241186a10770d010b024020012d0000410471450d0041012103200141186a2802004193eec00041012001411c6a28020028020c1101000d010b200141186a280200419aeec00041012001411c6a28020028020c11010021030b200241d0006a240020030bc50201037f230041c0006b220224000240024002402001280208220341206a220420012802044d0d0020004181063b01000c010b200141086a2004360200200341604f0d0120012802002101200241386a4200370300200241306a4200370300200241206a41086a420037030020024200370320200120036a2104411f2101200241206a2103024003402001417f460d012003200420016a2d00003a00002001417f6a2101200341016a21030c000b0b200241186a2201200241206a41186a290300370300200241106a2203200241206a41106a290300370300200241086a2204200241206a41086a29030037030020022002290320370300200041003a0000200041206a2001290300370300200041186a2003290300370300200041106a2004290300370300200041086a20022903003703000b200241c0006a24000f0b200320041030000b970101017f230041c0006b220124002001411836020c2001419efdc000360208200120003a0017200141306a410c6a410f360200200141186a410c6a41023602002001412c6a410236020020014110360234200141b08fc1003602182001410236021c20014194fbc0003602202001200141086a3602302001200141176a3602382001200141306a360228200141186a41c08fc1001043000b970101017f230041c0006b220124002001412b36020c200141b6fdc00036020820012000360214200141306a410c6a4111360200200141186a410c6a41023602002001412c6a410236020020014110360234200141b08fc1003602182001410236021c20014194fbc0003602202001200141086a3602302001200141146a3602382001200141306a360228200141186a41c08fc1001043000bed0103027e017f057e2001290308220320022903087c2204200354210520022903182106200229031021072001290318210320012903102108024002402001290300220920022903007c220a20095a0d00200442017c220920045420056a21050c010b200421090b200820077c22042008542101024002402005450d0020042005ad7c220720045420016a21010c010b200421070b200320067c220820035421020240024002402001450d0020082001ad7c220320085420026a0d010c020b200821032002450d010b41d08fc100104f000b200020093703082000200a37030020002007370310200020033703180bd806010b7f230041206b2201240002400240024002400240024002400240024010002202450d00200141086a20021085014100210302400340200320024e0d01200341016a2103200141086a1086010c000b0b200128020822021001024020012802102204450d00200441796a4100200441074b1b2105410021030340024002400240024002400240200220036a22062d0000220741187441187522084100480d002006410371450d01200341016a21030c050b41012109200741dde6c0006a2d000022064104460d0220064103460d0120064102470d09200341016a220620044f0d0b418002210741012109200220066a2d000041c00171418001460d030c0f0b0240200320054f0d000340200220036a220641046a280200200628020072418081828478710d01200341086a22032005490d000b0b200320044f0d030340200220036a2c00004100480d04200341016a22032004490d000c040b0b41002107200341016a220620044f0d0a200220066a2d000021060240024020084160470d00200641607141ff017141a001460d010b0240200641ff0171220a41bf014b220b0d002008411f6a41ff0171410b4b0d0020064118744118754100480d010b0240200a419f014b0d002008416d470d0020064118744118754100480d010b200b0d08200841fe017141ee01470d08200641187441187541004e0d080b41002109200341026a220620044f0d0d200220066a2d000041c00171418001460d010c080b41002107200341016a220620044f0d09200220066a2d000021060240024020084170470d00200641f0006a41ff0171412f4d0d010b0240200641ff0171220a41bf014b0d002008410f6a41ff017141024b0d0020064118744118754100480d010b200a418f014b0d0720084174470d07200641187441187541004e0d070b200341026a220620044f0d09200220066a2d000041c00171418001470d0741002109200341036a220620044f0d0c200220066a2d000041c00171418001470d0a0b200641016a21030b20032004490d000b0b2000200220041048200141086a10250c010b2000418cfcc000410010480b200141206a24000f0b41800221070c050b41800421070c030b410021070b410021090c020b41800621070b410121090b200120033602182001200720097236021c200141186a105a000b3402017f017e230041106b22022400200241086a20011021200229030821032000410036020820002003370200200241106a24000b4501017f0240200028020822012000280204470d00200041011029200041086a28020021010b200028020020016a41003a0000200041086a2200200028020041016a3602000b7801037f230041106b220124000240024010022202450d00200120021085014100210302400340200320024e0d01200341016a210320011086010c000b0b20012802001003200041086a200141086a280200360200200020012903003702000c010b20004100360208200042013702000b200141106a24000bab0c03047f027e037f23004180026b22002400200041186a1084012000280220210120002802182102200041286a108701024002400240024020014108470d00200028023021012000280228210302402002418cfcc000460d00200229000042e1c891cbc6aedab7ee00520d010b2000200136023c20002003360238410021012000410036024020004188016a200041386a108001200041c8006a20004188016a10890120004188016a200041386a108001200041e8006a20004188016a108901200041d0016a41186a200041c8006a41186a290300370300200041d0016a41106a200041c8006a41106a290300370300200041d0016a41086a200041c8006a41086a290300370300200020002903483703d00120004188016a41186a200041e8006a41186a29030037030020004188016a41106a200041e8006a41106a29030037030020004188016a41086a200041e8006a41086a2903003703002000200029036837038801200041b0016a200041d0016a20004188016a10830120002903b00122044280808080105a0d01200041b0016a41086a210202400340200141016a220141034b0d0120022903002105200241086a21022005500d000b41e88fc100104f000b20004190016a420037030020004198016a200442ffffffff0f83370300200041023a008801200041106a4180011021200041003602d801200020002903103703d0012000200041d0016a3602f801200020004188016a200041f8016a108a0122023602fc0120020d02200041fc016a108b01200041003602f401200041f4016a108b0120002802d0012102200020002902d40122053702d401200020023602d0014194fcc000410420022005422088a71004200041d0016a1025024020002d00880122024107714103490d000240024020024104460d0020024103470d0120004188016a41047210250c020b20004188016a410472220210382002103a0c010b20004188016a410472103b0b200041d0016a41186a2202200041c8006a41186a290300370300200041d0016a41106a200041c8006a41106a290300370300200041d0016a41086a2201200041c8006a41086a290300370300200020002903483703d00120004188016a41186a2203200041e8006a41186a29030037030020004188016a41106a2206200041e8006a41106a29030037030020004188016a41086a2207200041e8006a41086a2903003703002000200029036837038801200041b0016a200041d0016a20004188016a108301200041e8006a4120108501412010222208450d032001422037030020024100360200200020083602d401200041203602d001200042013703e0012003200041b0016a41186a2903003703002006200041b0016a41106a2903003703002007200041b0016a41086a290300370300200020002903b00137038801200041d0016a4104724120102c20002802d401200041dc016a28020022076a21064100210202400340200620026a2103200241016a2201411f4b0d01200341003a0000200121020c000b0b200041dc016a200720026a41016a220236020041002101200341003a0000200041086a4100412020002802d4012002102f200041a0016a2103200028020c21072000280208210841032106410021020240024002400340200241034b0d0120002001200720082007102f200641034b0d02200028020441074d0d03200241016a2102200028020020032903002205423886200542288642808080808080c0ff0083842005421886428080808080e03f8320054208864280808080f01f838484200542088842808080f80f832005421888428080fc07838420054228884280fe03832005423888848484370000200141086a2101200341786a21032006417f6a21060c000b0b200041d8016a2802002103200041e4016a2802002106200041e0016a280200210220002802d4012101200041e8006a200041e8016a2802002207200041dc016a28020022086a102c200041e8006a20012008102d200041e8006a20022007102d20022006102e20012003102e200028026820002802701005200041e8006a1025200041286a1025200041186a102520004180026a24000f0b4198fec000200641041074000b1034000b418090c100104f000b41e88fc100104f000b200041d0016a108c012002108201000b00000b5600024020012d00004101460d00200041186a200141206a290300370300200041106a200141186a290300370300200041086a200141106a2903003703002000200141086a2903003703000f0b20012d0001108101000bf90803027f017c027f23004180016b220224000240024002400240024002400240024002400240024020002d0000417f6a220341044b0d00024020030e050002030405000b200128020041e1fdc00041e5fdc00020002d000122031b4104410520031b1007200241033a00482002200241c8006a108d01220336022020030d0a200241206a108b010c080b200241c8006a2001280200108e012002200241c8006a108d01220336022020030d09200241206a108b010c070b200041086a28020022034101460d0320034102470d04200041106a2b03002204101541ff017141014b0d05200241c8006a2001280200108e012002200241c8006a108d01220336022020030d08200241206a108b010c060b2001200041046a2802002000410c6a280200108f0121030c070b2001200041046a101721030c060b02402000410c6a280200450d00200241c8006a20012802001090012002200241c8006a108d01220336022020030d06200241206a108b01410121050c050b200241c8006a20012802001090012002200241c8006a108d01220336022020030d05200241206a108b01200241c8006a20012802001091012002200241c8006a108d01220336022020030d05200241206a108b01410021050c040b200241106a200241c8006a200041106a29030010182001280200200228021020022802141007200241033a0020200241206a109201200241033a00482002200241c8006a108d01220336027820030d04200241f8006a108b010c020b200241086a200241c8006a200041106a290300101920012802002002280208200228020c1007200241033a0020200241206a109201200241033a00482002200241c8006a108d01220336027820030d03200241f8006a108b010c010b2004200241c8006a101a21032001280200200241c8006a20031007200241033a00202002200241206a108d01220336027820030d02200241f8006a108b010b410021030c010b200241206a200041046a101b200241c8006a200241206a41241095011a02400340200241186a200241c8006a101c20022802182200450d01200228021c21060240200541ff01714101460d00200128020041eafdc000410110070b200241033a00782002200241f8006a108d01220336027420030d02200241f4006a108b012002200120002802002000280208108f01220336027820030d02200241f8006a108b01200241033a00782002200241f8006a108d01220336027420030d02200241f4006a108b0120024100360244200241c4006a108b01200128020041ebfdc00041011007200241033a00782002200241f8006a108d01220336027420030d02200241f4006a108b01200220062001108a01220336027820030d02200241f8006a108b01200241033a00782002200241f8006a108d01220336027420030d02200241f4006a108b0120024100360244200241c4006a108b01410221050c000b0b41002103200541ff0171450d00200241c8006a20012802001091012002200241c8006a108d01220036022002402000450d00200021030c010b200241206a108b010b20024180016a240020030b4a01027f024020002802002201450d0002400240200128020022024101460d0020020d01200141086a280200450d012001280204101f0c010b200141046a1093010b2000280200101f0b0b0600200010250b4001017f230041106b22012400024020002d00004103470d00200141106a240041000f0b20012000290200370308200141086a101d2100200141106a240020000b10002000200141eefdc00041041094010b4101017f230041106b22032400200341086a20002001200210062003200341086a108d012200360204024020000d00200341046a108b010b200341106a240020000b10002000200141edfdc00041011094010b10002000200141ecfdc00041011094010b1400024020002d00004103460d0020001093010b0b4701017f024020002d00004102490d00200041046a22012802002200280200200028020428020011000002402000280204280204450d002000280200101f0b2001280200101f0b0b11002001200220031007200041033a00000b3601017f02402002450d00200021030340200320012d00003a0000200141016a2101200341016a21032002417f6a22020d000b0b20000b6901017f02400240200120004f0d002002450d010340200020026a417f6a200120026a417f6a2d00003a00002002417f6a22020d000c020b0b2002450d00200021030340200320012d00003a0000200141016a2101200341016a21032002417f6a22020d000b0b20000b4401037f024002402002450d00410021030340200020036a2d00002204200120036a2d00002205470d02200341016a22032002490d000b41000f0b41000f0b200420056b0b3c01017f230041106b2205240020052001200220032004109901200529030021012000200541086a29030037030820002001370300200541106a24000b7501027e200020034220882205200142208822067e200320027e7c200420017e7c200342ffffffff0f832203200142ffffffff0f8322017e2204422088200320067e7c22034220887c200342ffffffff0f83200520017e7c22034220887c37030820002003422086200442ffffffff0f83843703000b5701017e02400240200341c000710d002003450d0120012003413f71ad2204882002410020036b413f71ad86842101200220048821020c010b20022003413f71ad882101420021020b20002001370300200020023703080b3a01017f230041106b220424002004200120022003109a01200429030021012000200441086a29030037030820002001370300200441106a24000b0bfe93010300418080c0000bf27d2f726f6f742f2e636172676f2f72656769737472792f7372632f6769746875622e636f6d2d316563633632393964623965633832332f73657264655f6a736f6e2d312e302e33382f7372632f7365722e7273225b5c745c725c6e5c665c625c5c5c225d000000000000000000000000002f726f6f742f2e636172676f2f72656769737472792f7372632f6769746875622e636f6d2d316563633632393964623965633832332f75696e742d302e332e302f7372632f75696e742e72732f726f6f742f2e636172676f2f72656769737472792f7372632f6769746875622e636f6d2d316563633632393964623965633832332f627974656f726465722d312e332e312f7372632f6c69622e7273496e76616c6964426f6f6c496e76616c6964553332496e76616c6964553634556e6578706563746564456f66496e76616c696450616464696e674f7468657230313233343536373839616263646566757575757575757562746e7566727575757575757575757575757575757575750000220000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006120446973706c617920696d706c656d656e746174696f6e2072657475726e20616e206572726f7220756e65787065637465646c79454f46207768696c652070617273696e672061206c697374454f46207768696c652070617273696e6720616e206f626a656374454f46207768696c652070617273696e67206120737472696e67454f46207768696c652070617273696e6720612076616c7565657870656374656420603a60657870656374656420602c60206f7220605d60657870656374656420602c60206f7220607d60657870656374656420607b60206f7220605b606578706563746564206964656e7465787065637465642076616c7565657870656374656420737472696e67696e76616c696420657363617065696e76616c6964206e756d6265726e756d626572206f7574206f662072616e6765696e76616c696420756e69636f646520636f646520706f696e74636f6e74726f6c2063686172616374657220285c75303030302d5c75303031462920666f756e64207768696c652070617273696e67206120737472696e676b6579206d757374206265206120737472696e676c6f6e65206c656164696e6720737572726f6761746520696e2068657820657363617065747261696c696e6720636f6d6d61747261696c696e672063686172616374657273756e657870656374656420656e64206f662068657820657363617065726563757273696f6e206c696d69742065786365656465644572726f72282c206c696e653a202c20636f6c756d6e3a20547269656420746f20736872696e6b20746f2061206c617267657220636170616369747900000100000000000000000000000000000434333333333333333333333333333303c3f5285c8fc2f5285c8fc2f5285c8f029cc420b0726891ed7c3f355eba490c02933a014d840d4faf946588635ddc460376c8cd70033e3f8c101e6d1cb1169f02c5060b2769fe98d6a6b1bd16f4de18026ea411d841caf4f00ae9955753fe5a03f1e9daac3408f7f33b871146dc31af02c154e2232aa0c55c96d2da047dc1250235216a3910cdd5fa56b7f73afb9b6f035ee75494a63ddefbab922c2ffcafbf0218b910dd1efee42f2342bd2530f33202bfc11ac89796a14c38d02e094db8840333ce7b0613124e3d607325d47093d00229d82f05dc743e64b3c2eadcf3754002a726e6a1f9ba306d853711fb52569a032052ebe7fafb2624d192dac8a8dee102800e89b9c8fceb1c7475483aba4b4e02ccb0418fa7c7ac948655daf62979b003d7f39a72ecd223aa6b4448922194f3027929af5bf0db4fbbef69d34181765c028d754b2c1a934cc5b2dceb020224c7030b5e3cf014dcd69d284a560268b60503d6e4c959aa49124bedd4113553f86a0289d40ff6760fea4415bb4fbb1e5ade0307aa0cf82bd9546a7762d99518481803d2543d93897add21f98147de46d37902502162b8752a2f3628030ccad71ef6030d814e6091bb25f8ec68d6d4df4b2b030b34a5e60d9684c6f05378dd7f0989023cc31d523eab03d2f30f2db1cc3a07022c0596b663789fe952e614b57ac43e035737ab2bb6c6b28775eb43f72e9d9802452cbcefc46bf5d22a89695ff2b01302a2132d193b79551ede410fffb6b45203e84257472f94774b4bcea5659290a802ba68df055943f9d5d5715151a8732002294132d6f49e5b56891c4fb5731f6703213428785db2afde6db0a52af6e5b80281f6ec2cb18e8c188bf3eaeec4842d029bbd147b1bb1ad8ddeb8447ea1077c037c64ddc8e2c0577118c70365b49fc902cab64a3a82cddf8d136c69ea29e63a0242f1ddf669e23216ecaca8104370910335f4175fee81f5442357eda635c0da02c429134c58ce2a371cac8a85c4994802d342b879c0e3aabec67977a26d5ca703763560610083556505fbc54ef149ec022b91e64d009c77b76a629ed88da1560212b53d169af958f2dd03975a49cfbd0341f7ca1148617a5b7e6912e26d3ffe0201f93b0ea01a95affeed411b8bff64029bc12c7d66f7547f974936c511ccd403e39af030855faa3279d4916a41a3100382155a5a371955f56010dbeecdb573029d55c3c38b5bbbbb341af84a1656ec034a1169690916c92f2a4893d5117823033c74baba3aab6d59bb39dcaa74c682023090fb2e62ef8a47fcfa7c555d380202e6192c4bd04bded8c6c4945595c03603b814f0080da37ead386addaaaa3392029310c0a03d4f6524fa54e4bbbb8f0e02eb806634fcb13b3a90213ac6927f4a0389cd1e5d638efc94a6e7949ea8ffa102d40a7f4a1ca563aaeb52aa4bed321b02edaa3177603b6cdd451eaa12e2b75e03bd88f4f819c989176b4bbbdbb42cb202646d902d7b3a6eac553cfce2c32328023ae2b315c590e3138960609e6c6c7303621bc3776a0db6dca0b3e6b123bdc202b5e268f921715e7d4d29528e1c64350287370e8f691b97c8487583b02da088036c2cd8d8bae278a0a02a69c057b3d30224bd79adc81bc7e6e6ee20cddff5420239c8c248742cd80a0b4bcee132569e03fa6c353a9023e03b6fa23e4ec211e50295bd2ac8d982e62f8c1b32d801db5002eec8aaa68f04a44ce0f81c8d9c91b4032507ef1ea603503d802d17a4e3daf602519f257f1e3673976624ace982155f02e8fe0865ca89eb8b0a07ad429e55cb0386653ab76ea1ef6f086c8a684b1109036b84fbf8be1a26f33923d5866fa76d02453a5f8e3191d651f6d1213e7fa5e20337c8e571f440450ec57481fe98b71b0360d3b7f4296737d8d0c39acbe0927c02ff1e262143d88bf31a065edf9a84fa03ff4beb8002ad3c29afd1e4e57bd02e03cc3cbc000224caed5841eab7fcd98b02a430309a01503bbee0cd2193307b09029f1a4d900280f8c99a7c9c1eb45e4203e6ae3d4035332d3be296e37ef67e9b02b858310091c2bd954e12b6982bff150226c11bcdb49d2f894a1df08d12655603859a7c0af74a5907a24af3d70e84ab02d1ae63082c6f476c4ed5f5df0bd02202b41739daac7ea5131722566679e66a0390ac2d488a98b70fac81de5194ebbb02da56f16c3bad5fd9bc6718dba9ef2f025cf14eaef8e165f5faa5c091dce57f03b05a728b604e1e919551cda7e3b7cc028d4828091aa57edaaaa70a53e95f3d02157440a8290831f7aa72771e42669503de5c00edba39272cef8e5f1868ebdd024b4a00242f2eecbc253f19adb9224b0211aa33d3b116ad946fcb8eaec26aab03db5429dc271224aabfa2d8be9b88ef02e24354e31fa8e95499e84632163a59026a39ed9eccd97521c20d0bea89f6c10388c7bd180a7b91e7343e6fee079201033a39fe463b2f41b990fe585806a867025c28fdd75e1835f54d97c1f3d60cd9037d539779e5792ac4a412ce8f450a140331a9122e512e5503b7dba40c9e6e7602b40e51e381b0ee9ef1c507e1fcb0f003c30b744fce26f24bc104d380fdf326039c3cc3720b1f28a39ad0a800fe8f85024afd68f5d518201ce2a6209a31730402a9fba78889f4ccf99ca49af6e8513a032196b9d33a5d0afbe3b67bf8530e9502e74461a9c87d3b2f83c52f2d43d810020c3b354274fc2be5d108e6e1d1264e037062f734906356b7746d1e1bdbeba40226b5925d731c452c2af1b1157c891d02a3ee1dfc1ec7a113dd81e9559375620350254b63b2051b764aceba44dc2ab502a6ea08e9c137af913bd8fb36b0882a02707741dbcff2b18292f392f119417703f3c59ae23fc2f4ce0ef6db5aaecdc50290d17be8ff342a3f725e16afbed73702b2b55fdaff87439883fd564b648c8c035b914c48660636e002feaba2b6d6d602497470d351382b8035cbbc1b927845027520e7eb82c0de995578945f835aa20391b3858935cd4bae779343196948e802745cd13a910aa3be5fdc02e1206d5302b960b5f781aad1fd652d9e019baeb803614dc45fceeeda97512418ce4825fa0281d76919a558e2dfdae9ac716db7610234bf0f8f6e276a99c40f7b4fe28bcf032acc3f3f25b921e136a6953fe86f0c032270993284fa1ab4f884449986597002cf198fea39f7f7ec8da16d28a4f5e60340aea5bb9492f9230b4ef1b9e92a1f0399beb72faadbfa4f6f3ef4c787557f02c2fd2519ddc5f77f189753a63feffe039b641e14e437c6cc46df42b8ff583203af834b4383f904d76b7f356099ad8e028c9c6fcf35616a122399f74c14be0b021494b2185668dd839e8ef247edfc4503dddc8ee04420b19c4ba55b06f1639e027d7da5b3d019f416d61d1605f44f1802fbfb3bec4d29208b56c9896e86195a0396c9fcbca4ba193c45d407f2d17aae02df3aca30ea2eaec99d76395b0e2f2502fd2add1add177d0f968af591b0b16e036422e47b4a46973fab3b91418df4be0250e81c63080579cc55c90dce3d5d32024d0dfb04a7a1c1e0224249e362c883033ea4959d85b4674d82ce6d4f82d3cf02cbe9aa179ec31f719b0b8b3f68dc3f0245a9448c96d232e82bac11cca66099039eba033d4575f5ecefbca7091f1ae102b1fb026437c42a572697ec3a7fae4d02b592d16c256d44583d58475e987daf03c4dbda235157d07997466c4be0caf20203e37be940aca694df9e563c80d55b026c9e2c0f9b13718732fef0c66622c603bd7ef0d848a98d9f5bcbc03852e804036465c0e0d3ed0ae6e2d533fa74536a02d23b9a67b9af44a3042386c35452dd03a8fc1486c7bf03e9364f6b9c1075170320ca1038396669baf8d855b0732a79029a76b459283d422ac1f4221ab910f5031592c34720649bee00f71b48c7732a03aa41693980b6e2be002ce36c9f5c88025501216133c51bff66564f8a7fb00602bb9b01355208c6310b57e57632e73d03634901c441a0d1273cdf1d5f28ec9702820701d067b3a7ecfc184b7f532313029da501800c1fd9ad94c111321fd251037e8434333d7f7af176340e284cdba70298032a5c973295275f903e53a3e21f02266c769358b7eed8311a64b86b3766035223c542ad92587ac1e11c2d562cb802754f3702f10e7afbcde7e3f044f02c0254b28b03e81790c57c0cd3e7071a7b03aa8e3c698679a637cad6a8ec9fe1c802bb0bcaedd1fa51f9d4ab208a194e3a022b79767ce92a8328bbdfcda9f57c900356c75e3021ef6820fcb2a45491fdd902789f188d1a8ced19308f50dd0dfe470226ffc0e19046af5cb37e1a624963a603853267810dd2254a5c65481ba182eb0237f5b89ad774513bb0ea397c1a025602f1215bc425ee1b92b3aa5c602ad0bc038e81e269518b49dbc2bbe3195573fd027234b554746fd415cf2fb614445c6402b6205554ed4bbaefe4b25654d3c6d3032b1a4410f16ffbf283f5dea942d20f03ef14d0d9c08c2f8f69c418bb9b0e73027f21805c01aee5b1756df4c4924aeb03cc1a004a348b84c1f7bdf6030fa22203a348333b90a203ce5ffe5e363f1b82024f6d8f6273e802d87fcb18c565af01027f48b29db8409e599945c1a16fe5350399d3c117fa664be1ad37344e598491027adc67792e1f0981f192f6a47a030e02f6930c8f7dcb419bb5848aa12a9f4903f80f0a0cfed567aff736d51a224ca102c70c0870fe77b9f292c5dd7b4ea31a020baed94cca8cf51deb08962c17d25d033c8b14d7a170c4e4886dde56df74b102cad576121b5ad0836d24e5abb29027020f56f1835ec3b39f1507d5df1d8172033fab5a36e535f6b277d210b3e400c20266efae5eb7c491f592db73c283cd3402a3184b6425a14fefb7c51f3739af87034fadd5e91db43f8cf96a192c94f2d202d9bd77214bc3ff3c6122e1bca95b42022896bf68ab6bcc949bd001fb755f9d03b91166ed5589a31016da67625e4ce402fbda8457de6d1cda447bb94e183d50029191d458fde293f63ac528b1f394b3030e0eaae0fd1b43c5c89d20f4c210f602723ebbb364169c6a6db1b329cf735e024fca5eec6dbdf910afe8850fe552ca030cd54bf0576461da58ed37d9504208033d77098d7983e7e113f15f47da016d022e250f488f050c03531b3372909ce10325847206d96ad668427cc2c1a6e31a03b769280514ef11879b969b3452e97b02f2750dd5ece44f0b2c242c545075f903f5f73d77bd50a6a289b6897673f72d032a93312c31da51b50792d45e5c2c8b0222dc5a23f414db5d39db76e549f008026993c46b53eec42fc25ef13b7680410321a90323a9bed0bf017f27632bcd9a021a546982bacb739934ff8582ef7015022a20426a2a79ec5b87cb3c377f815503ef4c9bee219423e305d6635fffcdaa02590a49251b10b6b50478e9e5653e220227aa41d591e6bc22a15942d66ffd6903b921cedda7eb63b54de101452631bb0294b471b1ec2283f70a810104855a2f0253874f82479e9e25ab019c393bf77e03a9d2729b9f7e181ebc67162efcf8cb022142c2e2b2cb464b63b9de2430c73c02019d039e84df0a12d25b64a1e67194039a7d9cb103e63bdb744950b4eb27dd027c64b02736eb2f7c5dd4d92956864a022c07e7a55678192d2fba8fdc8970aa03bd05ecb7abc67a8af2940c4a6ec0ee0264d1bc2c56052fd58eddd6d4f1995802a0e8faad56d5e4217e62f1ba4ff6c0034dedfb574544eae764e88d950cc500030af12f13d169bbec83533e110a046702aa8119854ea9f8ad6c52fd817606d8038834e1d03e542d8bf04164ce5e381303d3f6800dffdcbdd5269bb63eb2c67502eb8a017cfec72f89a45e576450a4ef0389d59ac9fe9f8c3a1db2121d0d1d26033b11af07ff7f70c87d8ea87d0ae484022f74f2d29899f339fe7120fea1e903024b20b784f428ec8f63b600fdcf753903a2e6f8365dba89d9822b9afd3f5e94021c52fa2be461a14702567b64664b1002f91c2a136d69350c6a56c5a070454d032d1788425754c40988ab6a4d8d37a4028b12a09b12dd69a1398988d73df91c02ab1d00f950fb42022975da58c98e6103bc1700940dc9689bed907bad3a72b40296ac99a9d7a02049f173fcbdfbf4290257475c0f59010175e81fc7fcc5547603df057d3f4734672aed7fd2639e10c5024c9efd659ff6b8eef0ff41b67e40370246fdc83c32245be4e7ffcf56649a8b039fcaa0302850afb6ecff3f121d15d6027f08e72620408cf8566666dbb0dd4402fe733e3e00cd46278b703d92b462a10332c3fe6433d76b1f3c8d970e2a82e7025bcfcb505cdfefe5fc70ac0b88ce52022bb2df1afafeb23c2e1b47acd9b0b703565b19af61328f3058af05bd475af902abe2ad254e280c5a1359d130061561024504e3d5490dad29525bb5e70988ce039d364fde07718a54db1591ec07a00b03b12b0ce59f8d3bdd15ab0d8a39b36f02b512ada1cc152c95bc1149438febe50391a8bde7d6775677300ed4350c561e03a753318645c6dec526d8dcf73cab7e020000000000000000000000000000000100000000000000000000000000004001000000000000000000000000000090010000000000000000000000000000f4010000000000000000000000000080380100000000000000000000000000a086010000000000000000000000000048e801000000000000000000000000002d310100000000000000000000000040787d0100000000000000000000000050d6dc01000000000000000000000000f2052a010000000000000000000000806e8774010000000000000000000000204aa9d101000000000000000000000054ce0923010000000000000000000000e941cc6b0100000000000000000000406352bfc60100000000000000000000087e93371c01000000000000000000008a5d7845630100000000000000000080ec74d616bc01000000000000000000d01309468e1501000000000000000000c4588bd7f15a01000000000000000000f52e6e4daeb10100000000000000002059dd64f00c0f01000000000000000068af147e2cd05201000000000000000042db999d3784a7010000000000000040092980c2a2b2080100000000000000904b3320734bdf4a0100000000000000741e40e84f1e979d0100000000000080081328f1f1727e0201000000000000a0ca17726dae0f1e430100000000000048bd9dce089a93e593010000000000009a2c45028b80f8def801000000000040e03b6be156505b8b3b01000000000050d80ac6996c24326e8a010000000000648e8d37c087adbe09ed010000000080fe78b822d8742c1726340100000000203e97662b0e92f79c2f810100000000a80d3d40b6917635847be10100000000892826e8111b6aa132ed2c0100000040abb22f62d6a1c4497f28780100000010569fbbfa4bca351c9f32d601000000ca9543b57c6f9ea171a3df25010000803c7b94e25b0b060a4e8c576f010000a00b9a39db328e878c616f2dcb01000044470004c9dfb8d4f79c65fc1e01000015590045bb17e7c935047fbb660100405a6f4016aadd603c43c55e6ac00100689845e84d8a8abc054a3b7b4218010082fe5662e12cad2b871c0a1a535e018022beecba197898f6a8a38ce0e7b50190d5f6d314104b1f9a49e657ecb01101f48af4081ad41da700dcdf6d271d5601b1ad318b2049e5d000d3574971a4ab018e0cff56b44d8f82e0e3d6cdc6460b01b2cfbe6c212133a3d89c4c8178184e019e83eec769e9ffcb0ec49fa1969ea1014312f51ce2f17f3f89da03251e030501d45632a45aee5f8f2bd144aee543460189ec3e4df1e937737605d619dfd49701aba78ea06de40510d4864be016cafd01cb285984c4ae038a44342f4c4e9e3e01fd726fa5759a84ac55013bdfe1458e01bd4fcb0e13c1a517abc109575ad7f101d6113fe9ab98c7ee0a196676982637014bd68ee3d67e79aa4d9fff933ef08401de8b729c8cde17152187ff384e2ce6016b97c7e117eb2ead74b49fe3b0db2f01467d39dadda57ad891a1871c9dd27b0197dcc750554f994ef689a96344c7da01dee97c5295d11ff139f649be8abc280156241ca7fac5676dc873dc6dadeb72016c2de35079b7c188ba9053c998a6cf0163fc8dd2ab127995743ad47d1fc821017c7b31c75657d7ba1149495d273a6a015bdafd782c2d8d29569b9b34b1c8c40179a89ecb3b3cf8d91541e1c06efd1a01975286be4a4b76505b911971cabc61013de7276e1dde9324b2f55f0dfd2bba0186f0d864d26adc568ff95b287e5b1401a82c0ffe8685932cf3f772b25d725901d2f792bde866b8f7efb50f1ff5ceaf01e3da7b765140d3fab5d1693359e10d019cd11ad46510887923464480af595101038621497f14ea57ac5755601bb0a501c1f3b48dcf4cf2b6cb56351c118e0701b230227103e0aea47eac426395714901dfbc6a4d0498da4d9e5713bcfacd9b010bb662b0029fa8f0c2168cb5bc6001018e637b5cc3c6d2ac731cefe2ebb84101713c9a337478079890e3aadb262792018ecb8040915609be749c9592f0b0f601387f50c81ad6c5f6c8819d5b962e3a01079f647aa14b77343be284f23bba8801c8c6fdd8891e9501ca1a26efcae8ea013d9c9e271633fd40bed077d57ed132014c4386b1db7f3cd1edc4d58ade857f0120d4e79dd29f8b4529368b2d5667df0194e4b0a2e34377cbd90177dc95a02b01b91d5d8bdc14553e50c29453bb887601276534ae135aea4de4f27928ea2ad40138bfe04c4c78b2b0ce374c59d29a240106ef18605f16df5cc2459fef86c16d01c82a1f38f7db16f4321787abe831c901bd7a13837a498ed87f6e346b31bf1d016c59d823d9dbb1ce1f8a01c6fd2e6501c76fce6ccf525ec2a7ec8137bd7abe01dc0501a4c1f37ad9e833b142b60c17015447010db2b0d90fe3805dd3e3cf5c0129994190de1cd0d31be134c8dc03b401b9ff281a0b126264b10c21fd69821001a83fb3e08d967abddd4f697c04a35401920fe058313cd92cd5a3839bc5cba901bb098cd79ec5073c654632815b1f0a012a0c6f8d06b7098bfed77e6132a74c0134cfca30c824cc2dfe8ddef9fed09f0180c17e1efd969fdcbe182b5c9fe20301e1711e66bc7cc793eede353347db4401590ea67feb5bb938aa56030019129601ef918f5fe6b2e7c6542c04409f96fb0135bbb9fbcfcf50fcb49b0288233e3d01032aa8fac303653ba242036aac8d8c01843452f9b4443eca4a13848417b1ef01d260d31bf1ea66be0e8cd2b2aece35010739c862ada5006e122f875f5a42830149477abb18cf8009d7fa68f7f012e4018d6c2c756f81f065c69ca19ad68b2e01b1877752cba16cfff7034a41cc2e7a019d6915273eca47fff5849c517fbad80102626dd866de8cbf19d301938f74270183ba888e0016702fe047c277b351710123e92ab2801b4c3bd8d9b25520a6cd01b6d15a6f30910f2527c88f35d48720012386318b7c7553ee30baf342c9a96801ace7fdaddb52e829bda8b0933bd4c201ccb0be4cc933313a76694e3ca5c41901ff5cee9fbb80bdc8d303628bce3560013ef4e987eae0ecbac8843a2e4243b801a738f294920cd474fd92e45c092a1301d1c62e3ab70f09d2bcb71db48bf457018578ba08a5538b06ac2525a1aef1ad01538b7425471417848b37b7240db70c0128aed1ee58d91c656e05e56dd0e44f01b219862aaf0f64fec9465e8904dea3010fd0937acd89fe3e3eecdad5c26a060113c438d9402cbece4da7518b7305480118f5860f51b76d422111266ed0069a012f59b4a9929284c9b4cad744424400017a6f215437b7e5fb61bd0dd65255400159cb29290525df7aba2c918ba76a90012f3e747346ee9619e977756e5185f401dda62808ec54feaff16a09e552d3380195d0320a27eafd1baec54b9e27088701ba84bfccb064fda219b7de8531cae801f4b2f77fee5ede057032abf35e7e3101b19ff51faaf655070cff95b0f6dd7d019e07f3a754742b09cf7ebb5c7455dd01c3e4f7e8b428bb65412ff5b968552a01f3dd3523e2f229bf117b72e8c2ea7401705503ac9a6ff42ed6198fa27325d201661582abc0c558dd2570994568572301c09a62d630f7ae542fccff56422d6c017041fb0bfdb4da293bbfbfec9238c701e6087d271eb128fa84d7f7d35b831c011f4b5cb165ddb23866cdf5c832a46301e75db31dbf94dfc6bf40337b3f8dbc01b01a9072f7bc4bdc770800ad47d815015c21344f35ac5ed3950a4098594e5b01b42901a3425736483b0d50feef21b20110bae0a589f6210d4508f2fe35550f0194e8580f2c746a50568aae7e832a5301b9222f13371185e4eb2c5a5e24f5a701b475fd6bc22ad36e135cf8ba36f9080121d3fc0673f5874a1873b66984374b01e907bcc8cff2295dde0f248465059e01f18475ddc1373afaea8996725fc302012ee6d254b2c5c8b8652c3c4f37744301b99f07ea1ef7fa267f370b2345519401a88789a4e6b4b9f05e05ce6b9665f901c9f4d526101174565bc360037edf3b01fb718b305415112c32f438845dd78a017a4eae3ca95a15b73e3147e5348ded010cf1ecc5a9586d32c77e4c0f417834014f2d6837d4ae08ff789e1f5351968101a338424589daca3e1786e7a7e5fbe101666349cb95c83e87ceb3f0886f3d2d013fbc1b3ebb7a0e29c2e02c6bcb8c78014faba20d6a1952b3f218f845feafd60111ab8548e24f13b0970fbbebfe2d2601d615a7dada23189c7dd3a9a67eb96f014bdb5091d12c1e035d485450dea7cb010f89d2fa02dcf2213aad34f2ea481f01532b87b903936faa88d8c1ae251b670128f6e8a7c4770bd5aa4e721aefe1c001d999f1e8da2a27c52a718770358d18014f002ea391f57076754da9cc82b05e016380f90bf6320dd4d2a0d37fa35cb6013ef07bc7d93f88c48344e42fe6f911014dec5a39d04faab5a455ddbb5f78560160a7b147c4e314e30dabd4aa7716ac019c08cfac5a0eedade8eac4ca0a8e0b01c3ca0258f15168d9a225767d8d714e01747d03ae6d66c28f0bafd3dcf00da201682ec28c0480d939674d048ab648050103baf2af05e04f08c160852ce49a46018368ef1b07d8634af1b8a6379d419801a442ebe208cefc9c2d6790850452fe01a709d38dc5001e827c407ad342f33e0110cc47f1f680a5a29bd0588813b08e0115bf99ad34e14e8bc2046f6a185cf2016d1780ecc04c1197f96285428f793701481da027f19fd5fcb7bb2613f35785019a248871ed070bfca56af0d7efade601e016f566f4e486bda742f6e6b52c3001985cb280319ee8ac51d3b360e3377c01bef3dee0bdc5221826c8e038dc45db0157588bac96bb15cf177d8ca3a90b29016d2eae577c2adbc25d9c6f0c944e730108ba996d1bf5913375838b0f3922d0014514802431393b402932b7a9631522015619a06d7d074a90b3fe2494bc9a6a01ac1f08c95c895c74603e2eb96b41c501cb13a5fdd9d5b948fce6bc53e3481b01be580e7d504be85abb20ac281c1b6201eeee519c245ea231ea28d732e3a1ba015435b3e1d67a055f9279c6ff2da51401aa02209a8cd9c6f6f617b87f79ce59015403a8c0ef8f78b4f41da6df1742b001140269d8f559cbf0b8d2c7eb4e290e019a42834e7330fe2c67c7b9a6a2b351014013242290bc3df8403968508b20a601088c5615da95269bc823411257d407010a2fac9a503bf0c1ba6cd1d66cc94901cd3a57c1244a6c72e9c7850cc83b9c01c084d6f856ae83e7f19cd3075da50101f0250cb7ec9964612e84c849b40e42016c2fcfe467c0bdf939a53a5c6192920147fb02de81302d78884e49b3f936f7010cddc12a513e1c4b15d10d105c823a014f547275e54de39d5a451114f322890163e9ced25e215c45b19615d9af6beb01de51c143db9459cb2e7eade74d23330155a6b11412fa2f7ebadd986121ec7f01eb0fde9996f8bb1d2915ffb929e7df01f3c92a205e7b95b2396d3f147af02b016f7c35a835da3a1f88484f9998ec76018bdb4212c3900927aa1aa3bfbea7d40137c969eb79fa6558aaf0c537d7e82401853b446618797feed46cb7050d236e01664ad57f5e571f2a0a482547d0abc901804ee50f9b96535a064d772c620b1e0120a2ded3417ce8f0472095b73a8e6501a84ad648529b22ed59687a65c9f1be01a9ee856d13a1353438816cdf1d571701536ae7485809434186a14757e52c5d01e844215baecb93d1e78919ad1e78b40111cbf4f84c5ffce230f62f2c13cb1001d5fd31372077bb1bbdf33bf7d7fd54014a7dfe44e854aa62acf00af54d3daa014e0e1f2b1175aabd6bd626b950660a01e2d1e675551215ad068c70e7e4ff4c015b8660d3ea565a5808af4c21de3fa001f8531cc45276383765edcfd4ea270401f7682375e7930685bee8038ae531450134436c52e1384826eee284ec5e7e9601025407a71947daafa91ba6a7f61dfc0181946408706ce80d4ad1c728ba923d01a1b97d0a8c8762919cc5f9b268f78c010a281d0d6f29bbb50337b8df4235f00106393268e5f994516222d3cb4921360147c73ec25e38fae5faeac73e9ca983011979ce7276c6789fb9e5794e0394e401b00bc1070a7cab03942f0c1182dc2e019c4eb1890c5b9604793b4f95a2937a0143a21daccff1bb45570aa33a8b38d9016a8592cb2177958b76e6a50457c32701c426773eead47a2e1460cfc52cb4710175f014ce248a193a193843f73721ce014916cd0057f64fc40f038afac2d42001db5b00c1ecf363b5d3832cb9f3096901d27240f1e7f0bca2c8a477a7704cc301c347c8f69016b665fdc6aa68c60f1a01b4597a34359c23bfbc78d502b893600121f098814283eceeebd68a03a6b8b8011596ff9009d2537553c636c2677313019a7b3ff58bc6a852e877c4b241505801815a8ff22ef85267e295751f5264ae01909899571ddb9380ad7da953b3fe0c01b4fe7fade4d1b8e018dd9328603e500162fedfd85d06e7185fd4b832f84da401fdfe8ba7fa63906fbb84b31fbbb00601bcfe6e51f97c744bea65a0e7e95c48016bbecaa5379c51de647f886124749a0103b79ec7a201f30a9f4ff5bc96880001c46486790bc2afcd86a3326cbcaa4001f5fde7578eb21b81684c3f876bd5900172fde1ed319f62a1821f0f69c60af501673ead347fa3dda4b173a901bc263901018ed8015f0c150e9ed013026b70870181b14ec2764f9a91c5c498c2854ce901f12e7139aa71007bfb7a9f99d3cf3101ad7acdc7148ec059ba590780c8437e0158d9c0f999b130f0283009a0bad4dd01d787183c006f1e9619be05a4f4a42a01cda91e4bc00aa6fb9f2d07cd314e75014054e65d708d8ffa07f94840bea1d201a8f4af3a66b899fca49b2de816a52301d2f15bc97f26c03b8e0239a25c8e6c0147eeb2bb1f30b0ca3143c7caf3b1c701ecd44fd5131eae1eff89bc5e38cf1c0127caa3ca98a559e67eac6b7606036401b1bc4cfdfe0ef09f9e970614c803bd01eff54f5e5f09f623c31e840c5d2216016af3e335b78bf3ec7326a54ff4aa5b0145f05c03a56e30e810708e63b195b2012b161a2227451e910a0639de8e9d0f01b69ba0ea70d665358d47c795f2845301a3c248250d4cbf827019393b2f66a801a6794d37888fb751e6af0385dd3f090110d820456a7325e6df9b44e6d48f4b01140e69d644d0aedfd7c2d51fca739e01cca801062b42cdebc699e5535e080301ff1282c7b592c0a63800dfe875ca4301bf97623963b770d046c0166313bd9401af3dbb073ce58c845870dc3b58ecf9018d06d584450fd85237c66925b7333c0131480ae616138e27c537c4eea4408b01302e30756e657870656374656420656e64206f662066696c656f74686572206f73206572726f726f7065726174696f6e20696e7465727275707465647772697465207a65726f74696d6564206f7574696e76616c69642064617461696e76616c696420696e70757420706172616d657465726f7065726174696f6e20776f756c6420626c6f636b656e7469747920616c72656164792065786973747362726f6b656e207069706561646472657373206e6f7420617661696c61626c656164647265737320696e207573656e6f7420636f6e6e6563746564636f6e6e656374696f6e2061626f72746564636f6e6e656374696f6e207265736574636f6e6e656374696f6e20726566757365647065726d697373696f6e2064656e696564656e74697479206e6f7420666f756e6401000000000000002000000000000000030000000000000003000000000000000300000020286f73206572726f72206f7065726174696f6e207375636365737366756c000000000000000000696e7465726e616c206572726f723a20656e746572656420756e726561636861626c6520636f64656c6962616c6c6f632f7261775f7665632e72736361706163697479206f766572666c6f773078303030313032303330343035303630373038303931303131313231333134313531363137313831393230323132323233323432353236323732383239333033313332333333343335333633373338333934303431343234333434343534363437343834393530353135323533353435353536353735383539363036313632363336343635363636373638363937303731373237333734373537363737373837393830383138323833383438353836383738383839393039313932393339343935393639373938393900010305050606030706080809110a1c0b190c140d120e160f0410031212130916011705180219031a071c021d011f1620032b062c022d0b2e01300331023202a902aa04ab08fa02fb05fd04fe03ff09ad78798b8da23057588b8c901c1ddd0e0f4b4cfbfc2e2f3f5c5d5fb5e2848d8e9192a9b1babbc5c6c9cadee4e5ff00041112293134373a3b3d494a5d848e92a9b1b4babbc6cacecfe4e500040d0e11122931343a3b4546494a5e646584919b9dc9cecf0d112945495764658d91a9b4babbc5c9dfe4e5f0040d1145496465808184b2bcbebfd5d7f0f1838586898b8c98a0a4a6a8a9acbabebfc5c7cecfdadb4898bdcdc6cecf494e4f57595e5f898e8fb1b6b7bfc1c6c7d71116175b5cf6f7feff800d6d71dedf0e0f1f6e6f1c1d5f7d7eaeafbbbcfa16171e1f46474e4f585a5c5e7e7fb5c5d4d5dcf0f1f572738f74759697c9ff2f5f262e2fa7afb7bfc7cfd7df9a409798308f1fffceff4e4f5a5b07080f10272feeef6e6f373d3f42459091feff536775c8c9d0d1d8d9e7feff00205f2282df048244081b04061181ac0e80ab351e1580e003190801042f043404070301070607110a500f1207550802041c0a090308030703020303030c0405030b06010e15053a0311070605100856070207150d500443032d03010411060f0c3a041d250d064c206d046a2580c80582b0031a0682fd035907150b1709140c140c6a060a061a0659072b05460a2c040c040103310b2c041a060b0380ac060a061f414c042d0374083c030f033c0738082a0682ff1118082f112d032010210f808c048297190b158894052f053b07020e180980af31740c80d61a0c0580ff0580b605240c9bc60ad23010848d033709815c1480b80880ba3d35040a06380846080c06740b1e035a0459098083181c0a1609460a808a06aba40c170431a10481da26070c050580a511816d1078282a064c04808d0480be031b030f0d0006010103010402080809020a050b0210011104120513111402150217021a021c051d0824016a036b02bc02d102d40cd509d602d702da01e005e802ee20f004f9040c273b3e4e4f8f9e9e9f060709363d3e56f3d0d104141836375657bd35cecfe01287898e9e040d0e11122931343a4546494a4e4f64655a5cb6b71b1c848509379091a8070a3b3e66698f926f5feeef5a629a9b2728559da0a1a3a4a7a8adbabcc4060b0c151d3a3f4551a6a7cccda007191a2225c5c604202325262833383a484a4c50535556585a5c5e606365666b73787d7f8aa4aaafb0c0d03f71727b5e227b0503042d036504012f2e80821d03310f1c0424091e052b0544040e2a80aa06240424042808340b018090813709160a088098390363080930160521031b05014038044b052f040a070907402027040c0936033a051a07040c07504937330d33072e080a81261f808128082a80a64e041e0f430e19070a0647092709750b3f412a063b050a0651060105100305808b5f2148080a80a65e22450b0a060d1338080a362c041080c03c64530c0181004808531d398107460a1d03474937030e080a0639070a8136198107839a66750b80c48abc842f8fd18247a1b98239072a040260260a460a28051382b05b65450b2f101140021e97f20e82f3a50d811f51818c89046b050d03090710936080f60a73086e1746809a140c570919808781470385420f1585502b87d580d7294b050a0402831144814b3c06010455051b3402810e2c04640c560a0d035c043d391d0d2c040907020e06809a83d50b0d030a06740c59270c0438080a0628081e520c046703290d0a06030d30600e85926c6962636f72652f736c6963652f6d6f642e7273696e64657820206f7574206f662072616e676520666f7220736c696365206f66206c656e67746820736c69636520696e64657820737461727473206174202062757420656e647320617420010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002020202020202020202020202020202020202020202020202020202020203030303030303030303030303030303040404040400000000000000000000005b2e2e2e5d00000100000000000000200000000000000003000000000000000300000000000000030000000100000001000000200000000000000003000000000000000300000000000000030000000100000002000000200000000000000003000000000000000300000000000000030000000100000000000000200000000000000003000000000000000300000000000000030000000100000001000000200000000000000003000000000000000300000000000000030000000100000002000000200000000000000003000000000000000300000000000000030000000100000003000000200000000000000003000000000000000300000000000000030000000100000000000000200000000000000003000000000000000300000000000000030000000100000001000000200000000000000003000000000000000300000000000000030000000100000002000000200000000000000003000000000000000300000000000000030000000100000003000000200000000000000003000000000000000300000000000000030000000100000004000000200000000000000003000000000000000300000000000000030000006c6962636f72652f7374722f6d6f642e72736279746520696e64657820206973206e6f742061206368617220626f756e646172793b20697420697320696e7369646520202862797465732029206f66206060626567696e203c3d20656e642028203c3d2029207768656e20736c6963696e672060206973206f7574206f6620626f756e6473206f662060557466384572726f7276616c69645f75705f746f6572726f725f6c656e00000000006c6962636f72652f666d742f6d6f642e727363616c6c656420604f7074696f6e3a3a756e77726170282960206f6e206120604e6f6e65602076616c75656c6962636f72652f6f7074696f6e2e72734572726f720a200a7d207d282920202020207b0000000000000000000000000000006c6962636f72652f756e69636f64652f626f6f6c5f747269652e7273000000000000c0fbef3e00000000000e0000000000000000000000000000f8fffbffffff0700000000000014fe21fe000c00000002000000000000501e2080000c00004006000000000000108639020000002300be2100000c0000fc02000000000000d01e20c0000c0000000400000000000040012080000000000011000000000000c0c13d60000c0000000200000000000090443060000c00000003000000000000581e2080000c00000000845c8000000000000000000000f207807f000000000000000000000000f21b003f000000000000000000030000a002000000000000fe7fdfe0fffeffffff1f40000000000000000000000000e0fd66000000c301001e006420002000000000000000e00000000000001c0000001c0000000c0000000c00000000000000b03f40fe0f200000000000380000000000006000000000020000000000008701040e00008009000000000000407fe51ff89f000000000000ff7f0f0000000000d0170400000000f80f00030000003c3b00000000000040a303000000000000f0cf000000f7fffd211003fffffffffffffffb00100000000000000000ffffffff01000000000000800300000000000000008000000000ffffffff0000000000fc00000000000600000000000000000080f73f000000c0000000000000000000000300440800006000000030000000ffff038000000000c03f000080ff030000000000070000000000c813000000002000000000000000007e660008100000000000100000000000009dc1020000000030400000000000202100000000004000000000ffff0000ffff00000000000000000001000000020003000000000000000000000000000000000000000000000000000004000005000000000000000006000000000000000007000008090a000b0c0d0e0f000010111200001314151600001718191a1b001c0000001d000000000000001e1f20000000000021002200232425000000002600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000027280000000000000000000000000000000000290000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a0000000000000000000000000000000000002b2c00002d0000000000000000000000000000000000000000000000000000000000002e2f300000000000000000000000000000000000000000003100000000000000000000000000000000000000000000000000000000000000000000320033000000000000000000000000000000000000000000000000000034350000353535360000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000001000000000000000000c0076ef0000000000087000000006000000000000000f0000000c0ff01000000000002000000000000ff7f0000000000008003000000000078060700000080ef1f000000000000000800030000000000c07f001e000000000000000000000080d34000000080f8070000030000000000005801008000c01f1f0000000000000000ff5c00004000000000000000000000f9a50d000000000000000000000000803cb00100003000000000000000000000f8a70100000000000000000000000028bf00000000e0bc0f0000000000000080ff06fe0700000000f87980007e0e0000000000fc7f03000000000000000000007fbf0000fcfffffc6d000000000000007eb4bf000000000000000000a3000000000000000000000018000000000000001f000000000000007f000080070000000000000000600000000000000000a0c307f8e70f0000003c00001c00000000000000ffffffffffff7ff8ffffffffff1f2000100000f8feff00007ffffff9db07000000007f0000000000f00700000000000000000000ffffffffffffffffffffffffffffffffffff00002e2e696e646578206f7574206f6620626f756e64733a20746865206c656e20697320206275742074686520696e646578206973204e6f6e65536f6d650100000000000000200000000000000003000000000000000300000000000000030000000100000001000000200000000000000003000000000000000300000000000000030000006c6962636f72652f726573756c742e72733a2061726974686d65746963206f7065726174696f6e206f766572666c6f776164646974696f6e636f64656578706c696369742070616e69637372632f6c69622e7273496e7465676572206f766572666c6f77207768656e2063617374696e6720553235362f726f6f742f2e636172676f2f72656769737472792f7372632f6769746875622e636f6d2d316563633632393964623965633832332f75696e742d302e332e302f7372632f75696e742e7273617267756d656e74206465636f64696e67206661696c656463616c6c65642060526573756c743a3a756e77726170282960206f6e20616e2060457272602076616c75657472756566616c73652c3a7d7b6e756c6c0041f8fdc0000ba01200001000520000004406000012000000bc00100050000000d307000009000000700010004c00000012020000300000001200000004000000040000001300000014000000150000007a041000060000008004100008000000880410000a0000001a371000010000009204100024000000f82c1000130000004b020000090000000c3e100000000000a82c10000b0000001a371000010000000c3e100000000000d02c100028000000f82c100013000000f80100001e0000000b2d100011000000f82c100013000000f50200000500000012331000060000001833100022000000fe3210001400000071080000050000003a33100016000000503310000d000000fe321000140000007708000005000000263610000b0000008836100016000000653610000100000014361000120000002e08000009000000663610000e00000074361000040000007836100010000000653610000100000014361000120000003208000005000000263610000b000000313610002600000057361000080000005f36100006000000653610000100000014361000120000003f080000050000001600000004000000040000001700000016000000040000000400000018000000190000000c000000040000001a0000001b0000001c000000c0361000120000005704000011000000d23610002b000000fd361000110000006301000015000000c0361000120000004b040000280000001d00000004000000040000001e0000001f000000200000000c3e1000000000001437100001000000ed3d100002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000f8030000000000000000000000000000000000000000000000000000000000000000feffffffffbfb6000000000000000000ff070000000000f8ffff0000010000000000000000000000c09f9f3d0000000002000000ffffff0700000000000000000000c0ff01000000000000f80f20503710004a000000a039100000020000a03b10003700000000010203040506070809080a0b0c0d0e0f10111213140215161718191a1b1c1d1e1f2002020202020202020202210202020202020202020202020202222324252602270228020202292a2b022c2d2e2f300202310202023202020202020202023302023402020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202023502360237020202020202020238023902020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202023a3b3c020202023d02023e3f4041424344454602020247020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202024802020202020202020202024902020202023b02000102020202030202020204020506020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020702020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020c3e100000000000583d100002000000303710001c0000003100000019000000303710001c0000003200000020000000303710001c0000003400000019000000303710001c0000003500000018000000303710001c00000036000000200000005a3d1000200000007a3d100012000000210000000000000001000000220000000c3e100000000000ed3d100002000000dc3d100011000000f103000005000000ef3d10001d000000523e10004c0000006205000001000000303e100022000000523e10004c0000006205000001000000183e10000e000000263e10000a0000001c0000000100000000419890c1000bd0030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'}
      );
      initStateDeltaHash = web3.utils.soliditySha3(
        {t: 'bytes', v: '0xf4408492e1498ffb832056831216c9072d0fa628dec2f8ee2a382c21e6c862af425b4f27fedcbc7606e7b8dc44971fd2b3ca6d763baa2407818fd724de3d9cd661'}
      );
      console.log('CODE HASH', codeHash);
      console.log('initStateDeltaHash', initStateDeltaHash);

      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.deploySecretContract(scTask.taskId, scTask.preCodeHash, codeHash,
          initStateDeltaHash, optionalEthereumData, optionalEthereumContractAddress, gasUsed, sig).send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
      });
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
      sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(1);
      expect(sampleContractBool).toEqual(false);
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * scTask.gasPx);
      expect(endingSenderBalance - startingSenderBalance).toEqual((scTask.gasLimit - gasUsed) * scTask.gasPx);
      expect(result.events.SecretContractDeployed).toBeTruthy();
    });

    // it('should simulate the contract deployment', async () => {
    //   const gasUsed = 25;
    //   codeHash = web3.utils.soliditySha3('1a2b3c4d');
    //   initStateDeltaHash = web3.utils.soliditySha3('initialized');
    //   const optionalEthereumData = '0x00';
    //   const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'uint64', v: 32},
    //     {t: 'bytes32', v: scTask.inputsHash},
    //     {t: 'uint64', v: 32},
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'uint64', v: 32},
    //     {t: 'bytes32', v: initStateDeltaHash},
    //     {t: 'uint64', v: 8},
    //     {t: 'uint64', v: gasUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'uint64', v: 1},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const startingWorkerBalance = worker.balance;
    //   const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
    //   let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
    //   let sampleContractBool = await sampleContract.methods.stateBool().call();
    //   expect(sampleContractInt).toEqual(1);
    //   expect(sampleContractBool).toEqual(false);
    //   const result = await new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.deploySecretContract(scTask.taskId, scTask.preCodeHash, codeHash,
    //       initStateDeltaHash, optionalEthereumData, optionalEthereumContractAddress, gasUsed, sig).send({
    //       gas: 4712388,
    //       gasPrice: 100000000000,
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    //   });
    //   worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const endingWorkerBalance = worker.balance;
    //   const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
    //   sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
    //   sampleContractBool = await sampleContract.methods.stateBool().call();
    //   expect(sampleContractInt).toEqual(1);
    //   expect(sampleContractBool).toEqual(false);
    //   expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * scTask.gasPx);
    //   expect(endingSenderBalance - startingSenderBalance).toEqual((scTask.gasLimit - gasUsed) * scTask.gasPx);
    //   expect(result.events.SecretContractDeployed).toBeTruthy();
    // });
    //
    // it('should create/send a new deploy contract task using wrapper function to test eth call', async () => {
    //   preCode = '9d075ae';
    //   let scTaskFn = 'deployContract(string,uint)';
    //   let scTaskArgs = [
    //     ['first_sc', 'string'],
    //     [1, 'uint'],
    //   ];
    //   let scTaskGasLimit = 100;
    //   let scTaskGasPx = utils.toGrains(1);
    //   const startingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   scTask = await new Promise((resolve, reject) => {
    //     enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode).
    //       on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   const endingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   expect(scTask).toBeTruthy();
    //   expect(scTask.scAddr).toBeTruthy();
    //   expect(scTask.preCode).not.toEqual('');
    //   expect(scTask.preCodeHash).not.toEqual('');
    //   expect(scTask.encryptedFn).toBeTruthy();
    //   expect(scTask.encryptedAbiEncodedArgs).toBeTruthy();
    //   expect(scTask.gasLimit).toEqual(scTaskGasLimit);
    //   expect(scTask.gasPx).toEqual(scTaskGasPx);
    //   expect(scTask.msgId).toBeTruthy;
    //   expect(scTask.sender).toEqual(accounts[0]);
    //   const msg = web3.utils.soliditySha3(
    //     {t: 'bytes', v: scTask.encryptedFn},
    //     {t: 'bytes', v: scTask.encryptedAbiEncodedArgs},
    //   );
    //   expect(enigma.web3.eth.accounts.recover(msg, scTask.userTaskSig)).toEqual(accounts[0]);
    //   expect(scTask.nonce).toEqual(3);
    //   expect(scTask.receipt).toBeTruthy();
    //   expect(scTask.transactionHash).toBeTruthy();
    //   expect(scTask.taskId).toBeTruthy();
    //   expect(scTask.ethStatus).toEqual(1);
    //   expect(scTask.proof).toBeFalsy();
    //   expect(endingContractBalance - startingContractBalance).toEqual(scTask.gasLimit * scTask.gasPx);
    //   expect(scTask).toBeTruthy();
    // });
    //
    // it('should get the pending deploy contract task', async () => {
    //   scTask = await enigma.getTaskRecordStatus(scTask);
    //   expect(scTask.ethStatus).toEqual(1);
    // });
    //
    // it('should fail to simulate the contract deployment with invalid eth call', async () => {
    //   const gasUsed = 25;
    //   codeHash = web3.utils.soliditySha3('1a2b3c4d');
    //   initStateDeltaHash = web3.utils.soliditySha3('initialized');
    //   const jsonInterface = {
    //     name: 'setStateVa',
    //     type: 'function',
    //     inputs: [
    //       {
    //         type: 'uint256',
    //         name: '_stateInt',
    //       }, {
    //         type: 'bool',
    //         name: '_stateBool',
    //       }],
    //   };
    //   const parameters = [5, true];
    //   const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
    //   const optionalEthereumContractAddress = sampleContract.options.address;
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: scTask.inputsHash},
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'bytes32', v: initStateDeltaHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   const worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.deploySecretContract(scTask.taskId, scTask.preCodeHash, codeHash,
    //       initStateDeltaHash, optionalEthereumData, optionalEthereumContractAddress, gasUsed, sig).send({
    //       gas: 4712388,
    //       gasPrice: 100000000000,
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
    //   })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Ethereum call failed');
    // });
    //
    // it('should simulate the contract deployment with eth call', async () => {
    //   const gasUsed = 25;
    //   codeHash = web3.utils.soliditySha3('1a2b3c4d');
    //   initStateDeltaHash = web3.utils.soliditySha3('initialized');
    //   const jsonInterface = {
    //     name: 'setStateVar',
    //     type: 'function',
    //     inputs: [
    //       {
    //         type: 'uint256',
    //         name: '_stateInt',
    //       }, {
    //         type: 'bool',
    //         name: '_stateBool',
    //       }],
    //   };
    //   const parameters = [5, true];
    //   const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
    //   const optionalEthereumContractAddress = sampleContract.options.address;
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: scTask.inputsHash},
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'bytes32', v: initStateDeltaHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const startingWorkerBalance = worker.balance;
    //   const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
    //   let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
    //   let sampleContractBool = await sampleContract.methods.stateBool().call();
    //   expect(sampleContractInt).toEqual(1);
    //   expect(sampleContractBool).toEqual(false);
    //   const result = await new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.deploySecretContract(scTask.taskId, scTask.preCodeHash, codeHash,
    //       initStateDeltaHash, optionalEthereumData, optionalEthereumContractAddress, gasUsed, sig).send({
    //       gas: 4712388,
    //       gasPrice: 100000000000,
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    //   });
    //   worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const endingWorkerBalance = worker.balance;
    //   const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
    //   sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
    //   sampleContractBool = await sampleContract.methods.stateBool().call();
    //   expect(sampleContractInt).toEqual(5);
    //   expect(sampleContractBool).toEqual(true);
    //   expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * scTask.gasPx);
    //   expect(endingSenderBalance - startingSenderBalance).toEqual((scTask.gasLimit - gasUsed) * scTask.gasPx);
    //   expect(result.events.SecretContractDeployed).toBeTruthy();
    // });
    //
    // it('should count state deltas after contract deployment', async () => {
    //   const count = await enigma.admin.countStateDeltas(scTask.scAddr);
    //   expect(count).toEqual(1);
    // });
    //
    // it('should get the confirmed deploy contract task', async () => {
    //   scTask = await enigma.getTaskRecordStatus(scTask);
    //   expect(scTask.ethStatus).toEqual(2);
    // });
    //
    // it('should verify deployed contract', async () => {
    //   const result = await enigma.admin.isDeployed(scTask.scAddr);
    //   expect(result).toEqual(true);
    // });
    //
    // it('should get deployed contract bytecode hash', async () => {
    //   const result = await enigma.admin.getCodeHash(scTask.scAddr);
    //   expect(result).toEqual(codeHash);
    // });
    //
    // it('should set the worker parameters (principal only) again for a second new epoch', async () => {
    //   let receipt;
    //   if (process.env.PRINCIPAL_CONTAINER) {
    //     const tx = await execInContainer(enigma, '--set-worker-params');
    //     receipt = await web3.eth.getTransactionReceipt(tx);
    //   } else {
    //     let blockNumber = await web3.eth.getBlockNumber();
    //     let getActiveWorkersResult = await enigma.enigmaContract.methods.getActiveWorkers(blockNumber).call({
    //       from: accounts[8],
    //     });
    //     let workerAddresses = getActiveWorkersResult['0'];
    //     let workerStakes = getActiveWorkersResult['1'];
    //     const seed = Math.floor(Math.random() * 100000);
    //     const msg = web3.eth.abi.encodeParameters(
    //       ['uint256', 'uint256', 'address[]', 'uint256[]'],
    //       [seed, 2, workerAddresses, workerStakes],
    //     );
    //     const hash = web3.utils.keccak256(msg);
    //     const sig = EthCrypto.sign(data.principal[4], hash);
    //
    //     receipt = await new Promise((resolve, reject) => {
    //       enigma.enigmaContract.methods.setWorkersParams(blockNumber, seed, sig).send({
    //         gas: 4712388,
    //         gasPrice: 100000000000,
    //         from: accounts[8],
    //       }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => {
    //         console.log('errored');
    //         reject(error);
    //       });
    //     });
    //   }
    //   expect(receipt).toBeTruthy();
    // }, 30000);
    //
    // it('should simulate getting the state keys for the contract / epoch', async () => {
    //   if (process.env.PRINCIPAL_CONTAINER) {
    //     const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
    //     const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
    //     const worker = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase());
    //     const stateKeys = await getStateKeysInContainer(enigma, worker, [scTask.scAddr]);
    //     console.log('the response', stateKeys);
    //   } else {
    //     console.log('Getting state keys requires the live Principal container.');
    //   }
    // });
    //
    // let scAddr;
    // let task;
    // it('should create task', async () => {
    //   scAddr = scTask.scAddr;
    //   let taskFn = 'medianWealth(int32,int32)';
    //   let taskArgs = [
    //     [200000, 'int32'],
    //     [300000, 'int32'],
    //   ];
    //   let taskGasLimit = 100;
    //   let taskGasPx = utils.toGrains(1);
    //   task = await new Promise((resolve, reject) => {
    //     enigma.createTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr, false).
    //       on(eeConstants.CREATE_TASK, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task).toBeTruthy();
    //   expect(task.scAddr).toBeTruthy();
    //   expect(task.preCode).toEqual('');
    //   expect(task.preCodeHash).toEqual('');
    //   expect(task.encryptedFn).toBeTruthy();
    //   expect(task.encryptedAbiEncodedArgs).toBeTruthy();
    //   expect(task.gasLimit).toEqual(taskGasLimit);
    //   expect(task.gasPx).toEqual(taskGasPx);
    //   expect(task.msgId).toBeTruthy();
    //   expect(task.sender).toEqual(accounts[0]);
    //   const msg = web3.utils.soliditySha3(
    //     {t: 'bytes', v: task.encryptedFn},
    //     {t: 'bytes', v: task.encryptedAbiEncodedArgs},
    //   );
    //   expect(enigma.web3.eth.accounts.recover(msg, task.userTaskSig)).toEqual(accounts[0]);
    //   expect(task.nonce).toEqual(4);
    // });
    //
    // it('should create task record', async () => {
    //   const startingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   task = await new Promise((resolve, reject) => {
    //     enigma.createTaskRecord(task).
    //       on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   const endingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   expect(task.receipt).toBeTruthy();
    //   expect(task.transactionHash).toBeTruthy();
    //   expect(task.taskId).toBeTruthy();
    //   expect(task.ethStatus).toEqual(1);
    //   expect(task.proof).toBeFalsy();
    //   expect(endingContractBalance - startingContractBalance).toEqual(task.gasLimit * task.gasPx);
    // });
    //
    // // it('should return funds', async () => {
    // //   console.log('task one', await enigma.enigmaContract.methods.tasks(task.taskId).call());
    // //   await enigma.enigmaContract.methods.returnFeesForTask(task.taskId).send({from: accounts[0]});
    // //   console.log('task one', await enigma.enigmaContract.methods.tasks(task.taskId).call());
    // // });
    //
    // it('should send task inputs to Enigma network', async () => {
    //   task = await new Promise((resolve, reject) => {
    //     enigma.sendTaskInput(task).
    //       on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task).toBeTruthy();
    // });
    //
    // it('should fail to create/send compute task using wrapper function because of failed worker encryption ' +
    //   'key rpc call', async () => {
    //   server.close(true);
    //   const consoleError = console.error; // save original console for future use
    //   console.error = jest.fn(); // mock console output to be disregarded, we know the following will error out
    //   scAddr = scTask.scAddr;
    //   let taskFn = 'medianWealth(int32,int32)';
    //   let taskArgs = [
    //     [200000, 'int32'],
    //     [300000, 'int32'],
    //   ];
    //   let taskGasLimit = 100;
    //   let taskGasPx = utils.toGrains(1);
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
    //       on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   })).rejects.toEqual({code: -32000, message: 'Network Error'});
    //   console.error = consoleError; // restore the original console
    //   server.listen();
    // });
    //
    // it('should fail to create/send deploy contract task using wrapper function due to insufficient funds',
    //   async () => {
    //     scAddr = scTask.scAddr;
    //     let taskFn = 'medianWealth(int32,int32)';
    //     let taskArgs = [
    //       [200000, 'int32'],
    //       [300000, 'int32'],
    //     ];
    //     let taskGasLimit = 901;
    //     let taskGasPx = utils.toGrains(1);
    //     await expect(new Promise((resolve, reject) => {
    //       enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[1], scAddr).
    //         on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
    //         on(eeConstants.ERROR, (error) => reject(error));
    //     })).rejects.toEqual({message: 'Not enough tokens to pay the fee', name: 'NotEnoughTokens'});
    //   });
    //
    // it('should fail to poll the network because of failed rpc call', async () => {
    //   server.close(true);
    //   const consoleError = console.error; // save original console for future use
    //   console.error = jest.fn(); // mock console output to be disregarded, we know the following will error out
    //   let taskStatuses = [];
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.pollTaskStatus(task).on(eeConstants.POLL_TASK_INPUT_RESULT, (result) => {
    //       taskStatuses.push(result.engStatus);
    //       if (result.engStatus === 'SUCCESS') {
    //         resolve();
    //       }
    //     }).on(eeConstants.ERROR, (error) => reject(error));
    //   })).rejects.toEqual({code: -32000, message: 'Network Error'});
    //   console.error = consoleError; // restore the original console
    //   server.listen();
    // });
    //
    // it('should poll the network until task confirmed without result', async () => {
    //   let taskStatuses = [];
    //   task = await new Promise((resolve, reject) => {
    //     enigma.pollTaskStatus(task).on(eeConstants.POLL_TASK_STATUS_RESULT, (result) => {
    //       taskStatuses.push(result.engStatus);
    //       if (result.engStatus === 'SUCCESS') {
    //         resolve(result);
    //       }
    //     }).on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task.encryptedAbiEncodedOutputs).toBeFalsy();
    //   expect(taskStatuses).toEqual(['INPROGRESS', 'INPROGRESS', 'INPROGRESS', 'INPROGRESS', 'SUCCESS']);
    // });
    //
    // it('should poll the network until task confirmed with result', async () => {
    //   server.resetCounter();
    //   let taskStatuses = [];
    //   task = await new Promise((resolve, reject) => {
    //     enigma.pollTaskStatus(task, true).on(eeConstants.POLL_TASK_STATUS_RESULT, (result) => {
    //       taskStatuses.push(result.engStatus);
    //       if (result.engStatus === 'SUCCESS') {
    //         resolve(result);
    //       }
    //     }).on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task.encryptedAbiEncodedOutputs).toBeTruthy();
    //   expect(taskStatuses).toEqual(['INPROGRESS', 'INPROGRESS', 'INPROGRESS', 'INPROGRESS', 'SUCCESS']);
    // });
    //
    // it('should get task result with invalid return status', async () => {
    //   server.resetCounter();
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.getTaskResult(task).
    //       on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   })).rejects.toEqual('Invalid task result status');
    // });
    //
    // it('should get task result of nonexistant task', async () => {
    //   task = await new Promise((resolve, reject) => {
    //     enigma.getTaskResult(task).
    //       on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task.engStatus).toEqual('null');
    // });
    //
    // it('should create/send compute task using wrapper function', async () => {
    //   scAddr = scTask.scAddr;
    //   let taskFn = 'medianWealth(int32,int32)';
    //   let taskArgs = [
    //     [200000, 'int32'],
    //     [300000, 'int32'],
    //   ];
    //   let taskGasLimit = 100;
    //   let taskGasPx = utils.toGrains(1);
    //   const startingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   task = await new Promise((resolve, reject) => {
    //     enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
    //       on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   const endingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   expect(task).toBeTruthy();
    //   expect(task.scAddr).toBeTruthy();
    //   expect(task.preCode).toEqual('');
    //   expect(task.preCodeHash).toEqual('');
    //   expect(task.encryptedFn).toBeTruthy();
    //   expect(task.encryptedAbiEncodedArgs).toBeTruthy();
    //   expect(task.gasLimit).toEqual(taskGasLimit);
    //   expect(task.gasPx).toEqual(taskGasPx);
    //   expect(task.msgId).toBeTruthy();
    //   expect(task.sender).toEqual(accounts[0]);
    //   const msg = web3.utils.soliditySha3(
    //     {t: 'bytes', v: task.encryptedFn},
    //     {t: 'bytes', v: task.encryptedAbiEncodedArgs},
    //   );
    //   expect(enigma.web3.eth.accounts.recover(msg, task.userTaskSig)).toEqual(accounts[0]);
    //   expect(task.nonce).toEqual(5);
    //   expect(task.receipt).toBeTruthy();
    //   expect(task.transactionHash).toBeTruthy();
    //   expect(task.taskId).toBeTruthy();
    //   expect(task.ethStatus).toEqual(1);
    //   expect(task.proof).toBeFalsy();
    //   expect(endingContractBalance - startingContractBalance).toEqual(task.gasLimit * task.gasPx);
    // });
    //
    // it('should get task result of unverified task', async () => {
    //   task = await new Promise((resolve, reject) => {
    //     enigma.getTaskResult(task).
    //       on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task.engStatus).toEqual('UNVERIFIED');
    // });
    //
    // it('should get task result of inprogress task', async () => {
    //   task = await new Promise((resolve, reject) => {
    //     enigma.getTaskResult(task).
    //       on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task.engStatus).toEqual('INPROGRESS');
    // });
    //
    // it('should fail to get task result because of failed prc call', async () => {
    //   server.close(true);
    //   const consoleError = console.error; // save original console for future use
    //   console.error = jest.fn(); // mock console output to be disregarded, we know the following will error out
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.getTaskResult(task).
    //       on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   })).rejects.toEqual({code: -32000, message: 'Network Error'});
    //   console.error = consoleError; // restore the original console
    //   server.listen();
    // });
    //
    // it('should get task result of failed task', async () => {
    //   task = await new Promise((resolve, reject) => {
    //     enigma.getTaskResult(task).
    //       on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task.engStatus).toEqual('FAILED');
    //   expect(task.encryptedAbiEncodedOutputs).toBeTruthy();
    //   expect(task.usedGas).toBeTruthy();
    //   expect(task.workerTaskSig).toBeTruthy();
    // });
    //
    // it('should get task result of successful computation', async () => {
    //   task = await new Promise((resolve, reject) => {
    //     enigma.getTaskResult(task).
    //       on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   expect(task.engStatus).toEqual('SUCCESS');
    //   expect(task.encryptedAbiEncodedOutputs).toBeTruthy();
    //   expect(task.delta).toBeTruthy();
    //   expect(task.usedGas).toBeTruthy();
    //   expect(task.ethereumPayload).toBeTruthy();
    //   expect(task.ethereumAddress).toBeTruthy();
    //   expect(task.workerTaskSig).toBeTruthy();
    // });
    //
    // it('should get the pending task', async () => {
    //   task = await enigma.getTaskRecordStatus(task);
    //   expect(task.ethStatus).toEqual(1);
    // });
    //
    // it('should simulate the task failure', async () => {
    //   const gasUsed = 25;
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: task.inputsHash},
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'bytes1', v: '0x00'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const startingWorkerBalance = worker.balance;
    //   const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
    //   const result = await new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.commitTaskFailure(scAddr, task.taskId, gasUsed, sig).send({
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    //   });
    //   worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const endingWorkerBalance = worker.balance;
    //   const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
    //   expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * task.gasPx);
    //   expect(endingSenderBalance - startingSenderBalance).toEqual((task.gasLimit - gasUsed) * task.gasPx);
    //   expect(result.events.ReceiptFailed).toBeTruthy();
    // });
    //
    // it('should count state deltas after task failure', async () => {
    //   const count = await enigma.admin.countStateDeltas(scAddr);
    //   expect(count).toEqual(1);
    // });
    //
    // it('should get the failed task', async () => {
    //   task = await enigma.getTaskRecordStatus(task);
    //   expect(task.ethStatus).toEqual(3);
    // });
    //
    // let stateDeltaHash;
    // let outputHash;
    // it('should fail to simulate the task receipt of already failed task', async () => {
    //   const gasUsed = 25;
    //   stateDeltaHash = web3.utils.soliditySha3('stateDeltaHash1');
    //   outputHash = web3.utils.soliditySha3('outputHash1');
    //   const optionalEthereumData = '0x00';
    //   const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'bytes32', v: task.inputsHash},
    //     {t: 'bytes32', v: initStateDeltaHash},
    //     {t: 'bytes32', v: stateDeltaHash},
    //     {t: 'bytes32', v: outputHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   const worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
    //       optionalEthereumData,
    //       optionalEthereumContractAddress, gasUsed, sig).send({
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
    //   })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Invalid task status');
    // });
    //
    // it('should fail to create/send compute task using wrapper function due to insufficient funds', async () => {
    //   let taskFn = 'medianWealth(int32,int32)';
    //   let taskArgs = [
    //     [200000, 'int32'],
    //     [300000, 'int32'],
    //   ];
    //   let taskGasLimit = 901;
    //   let taskGasPx = utils.toGrains(1);
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[1], scAddr).
    //       on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   })).rejects.toEqual({message: 'Not enough tokens to pay the fee', name: 'NotEnoughTokens'});
    // });
    //
    // it('should create/send a new compute task using wrapper function', async () => {
    //   let taskFn = 'medianWealth(int32,int32)';
    //   let taskArgs = [
    //     [200000, 'int32'],
    //     [300000, 'int32'],
    //   ];
    //   let taskGasLimit = 100;
    //   let taskGasPx = utils.toGrains(1);
    //   const startingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   task = await new Promise((resolve, reject) => {
    //     enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
    //       on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   const endingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   expect(task).toBeTruthy();
    //   expect(task.scAddr).toBeTruthy();
    //   expect(task.preCode).toEqual('');
    //   expect(task.preCodeHash).toEqual('');
    //   expect(task.encryptedFn).toBeTruthy();
    //   expect(task.encryptedAbiEncodedArgs).toBeTruthy();
    //   expect(task.gasLimit).toEqual(taskGasLimit);
    //   expect(task.gasPx).toEqual(taskGasPx);
    //   expect(task.msgId).toBeTruthy();
    //   expect(task.sender).toEqual(accounts[0]);
    //   const msg = web3.utils.soliditySha3(
    //     {t: 'bytes', v: task.encryptedFn},
    //     {t: 'bytes', v: task.encryptedAbiEncodedArgs},
    //   );
    //   expect(enigma.web3.eth.accounts.recover(msg, task.userTaskSig)).toEqual(accounts[0]);
    //   expect(task.nonce).toEqual(6);
    //   expect(task.receipt).toBeTruthy();
    //   expect(task.transactionHash).toBeTruthy();
    //   expect(task.taskId).toBeTruthy();
    //   expect(task.ethStatus).toEqual(1);
    //   expect(task.proof).toBeFalsy();
    //   expect(endingContractBalance - startingContractBalance).toEqual(task.gasLimit * task.gasPx);
    // });
    //
    // it('should simulate task receipt', async () => {
    //   const gasUsed = 25;
    //   const optionalEthereumData = '0x00';
    //   const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'bytes32', v: task.inputsHash},
    //     {t: 'bytes32', v: initStateDeltaHash},
    //     {t: 'bytes32', v: stateDeltaHash},
    //     {t: 'bytes32', v: outputHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
    //   let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   const startingWorkerBalance = worker.balance;
    //   const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
    //   let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
    //   let sampleContractBool = await sampleContract.methods.stateBool().call();
    //   expect(sampleContractInt).toEqual(5);
    //   expect(sampleContractBool).toEqual(true);
    //   const result = await new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
    //       optionalEthereumData,
    //       optionalEthereumContractAddress, gasUsed, sig).send({
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
    //   });
    //   sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
    //   sampleContractBool = await sampleContract.methods.stateBool().call();
    //   expect(sampleContractInt).toEqual(5);
    //   expect(sampleContractBool).toEqual(true);
    //   worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const endingWorkerBalance = worker.balance;
    //   const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
    //   expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * task.gasPx);
    //   expect(endingSenderBalance - startingSenderBalance).toEqual((task.gasLimit - gasUsed) * task.gasPx);
    //   expect(result.events.ReceiptVerified).toBeTruthy();
    // });
    //
    // it('should create/send a new compute task using wrapper function with eth call', async () => {
    //   let taskFn = 'medianWealth(int32,int32)';
    //   let taskArgs = [
    //     [200000, 'int32'],
    //     [300000, 'int32'],
    //   ];
    //   let taskGasLimit = 100;
    //   let taskGasPx = utils.toGrains(1);
    //   const startingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   task = await new Promise((resolve, reject) => {
    //     enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
    //       on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   const endingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   expect(task).toBeTruthy();
    //   expect(task.scAddr).toBeTruthy();
    //   expect(task.preCode).toEqual('');
    //   expect(task.preCodeHash).toEqual('');
    //   expect(task.encryptedFn).toBeTruthy();
    //   expect(task.encryptedAbiEncodedArgs).toBeTruthy();
    //   expect(task.gasLimit).toEqual(taskGasLimit);
    //   expect(task.gasPx).toEqual(taskGasPx);
    //   expect(task.msgId).toBeTruthy();
    //   expect(task.sender).toEqual(accounts[0]);
    //   const msg = web3.utils.soliditySha3(
    //     {t: 'bytes', v: task.encryptedFn},
    //     {t: 'bytes', v: task.encryptedAbiEncodedArgs},
    //   );
    //   expect(enigma.web3.eth.accounts.recover(msg, task.userTaskSig)).toEqual(accounts[0]);
    //   expect(task.nonce).toEqual(7);
    //   expect(task.receipt).toBeTruthy();
    //   expect(task.transactionHash).toBeTruthy();
    //   expect(task.taskId).toBeTruthy();
    //   expect(task.ethStatus).toEqual(1);
    //   expect(task.proof).toBeFalsy();
    //   expect(endingContractBalance - startingContractBalance).toEqual(task.gasLimit * task.gasPx);
    // });
    //
    // it('should fail to simulate task receipt with invalid eth call', async () => {
    //   const gasUsed = 25;
    //   const jsonInterface = {
    //     name: 'setStateVa',
    //     type: 'function',
    //     inputs: [
    //       {
    //         type: 'uint256',
    //         name: '_stateInt',
    //       }, {
    //         type: 'bool',
    //         name: '_stateBool',
    //       }],
    //   };
    //   const parameters = [10, false];
    //   const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
    //   const optionalEthereumContractAddress = sampleContract.options.address;
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'bytes32', v: task.inputsHash},
    //     {t: 'bytes32', v: stateDeltaHash},
    //     {t: 'bytes32', v: stateDeltaHash},
    //     {t: 'bytes32', v: outputHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   const worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
    //       optionalEthereumData,
    //       optionalEthereumContractAddress, gasUsed, sig).send({
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
    //   })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Ethereum call failed');
    // });
    //
    // it('should simulate task receipt with eth call', async () => {
    //   const gasUsed = 25;
    //   const jsonInterface = {
    //     name: 'setStateVar',
    //     type: 'function',
    //     inputs: [
    //       {
    //         type: 'uint256',
    //         name: '_stateInt',
    //       }, {
    //         type: 'bool',
    //         name: '_stateBool',
    //       }],
    //   };
    //   const parameters = [10, false];
    //   const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
    //   const optionalEthereumContractAddress = sampleContract.options.address;
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'bytes32', v: task.inputsHash},
    //     {t: 'bytes32', v: stateDeltaHash},
    //     {t: 'bytes32', v: stateDeltaHash},
    //     {t: 'bytes32', v: outputHash},
    //     {t: 'uint', v: gasUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const startingWorkerBalance = worker.balance;
    //   const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
    //   let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
    //   let sampleContractBool = await sampleContract.methods.stateBool().call();
    //   expect(sampleContractInt).toEqual(5);
    //   expect(sampleContractBool).toEqual(true);
    //   const result = await new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
    //       optionalEthereumData,
    //       optionalEthereumContractAddress, gasUsed, sig).send({
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
    //   });
    //   sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
    //   sampleContractBool = await sampleContract.methods.stateBool().call();
    //   expect(sampleContractInt).toEqual(10);
    //   expect(sampleContractBool).toEqual(false);
    //   worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const endingWorkerBalance = worker.balance;
    //   const endingSenderBalance = parseInt(
    //     (await enigma.tokenContract.methods.balanceOf(task.sender).call()),
    //   );
    //   expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * task.gasPx);
    //   expect(endingSenderBalance - startingSenderBalance).toEqual((task.gasLimit - gasUsed) * task.gasPx);
    //   expect(result.events.ReceiptVerified).toBeTruthy();
    // });
    //
    // it('should get the confirmed task', async () => {
    //   task = await enigma.getTaskRecordStatus(task);
    //   expect(task.ethStatus).toEqual(2);
    // });
    //
    // it('should count state deltas', async () => {
    //   const count = await enigma.admin.countStateDeltas(scAddr);
    //   expect(count).toEqual(3);
    // });
    //
    // it('should get state delta hash', async () => {
    //   const delta = await enigma.admin.getStateDeltaHash(scAddr, 2);
    //   expect(stateDeltaHash).toEqual(delta);
    // });
    //
    // it('should verify state delta', async () => {
    //   const isValid = await enigma.admin.isValidDeltaHash(scAddr, stateDeltaHash);
    //   expect(isValid).toEqual(true);
    // });
    //
    // it('should get output hash', async () => {
    //   const output = await enigma.admin.getOutputHash(scAddr, 1);
    //   expect(outputHash).toEqual(output);
    // });
    //
    // it('should fail to create task records due to insufficient funds', async () => {
    //   let taskFn = 'medianWealth(int32,int32)';
    //   let taskGasLimit = 500;
    //   let taskGasPx = utils.toGrains(1);
    //   let taskArgsA = [
    //     [200000, 'int32'],
    //     [300000, 'int32'],
    //   ];
    //   let taskArgsB = [
    //     [1000000, 'int32'],
    //     [2000000, 'int32'],
    //   ];
    //   let taskA = await new Promise((resolve, reject) => {
    //     enigma.createTask(taskFn, taskArgsA, taskGasLimit, taskGasPx, accounts[1], scAddr, false).
    //       on(eeConstants.CREATE_TASK, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   let taskB = await new Promise((resolve, reject) => {
    //     enigma.createTask(taskFn, taskArgsB, taskGasLimit, taskGasPx, accounts[1], scAddr, false).
    //       on(eeConstants.CREATE_TASK, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.createTaskRecords([taskA, taskB]).
    //       on(eeConstants.CREATE_TASK_RECORDS, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   })).rejects.toEqual({message: 'Not enough tokens to pay the fee', name: 'NotEnoughTokens'});
    // });
    //
    // let tasks;
    // it('should create multiple task records', async () => {
    //   let taskFn = 'medianWealth(int32,int32)';
    //   let taskGasLimit = 100;
    //   let taskGasPx = utils.toGrains(1);
    //   let taskArgsA = [
    //     [200000, 'int32'],
    //     [300000, 'int32'],
    //   ];
    //   let taskArgsB = [
    //     [1000000, 'int32'],
    //     [2000000, 'int32'],
    //   ];
    //   let taskA = await new Promise((resolve, reject) => {
    //     enigma.createTask(taskFn, taskArgsA, taskGasLimit, taskGasPx, accounts[0], scAddr, false).
    //       on(eeConstants.CREATE_TASK, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   let taskB = await new Promise((resolve, reject) => {
    //     enigma.createTask(taskFn, taskArgsB, taskGasLimit, taskGasPx, accounts[0], scAddr, false).
    //       on(eeConstants.CREATE_TASK, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   tasks = [taskA, taskB];
    //   const startingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   tasks = await new Promise((resolve, reject) => {
    //     enigma.createTaskRecords(tasks).
    //       on(eeConstants.CREATE_TASK_RECORDS, (result) => resolve(result)).
    //       on(eeConstants.ERROR, (error) => reject(error));
    //   });
    //   const endingContractBalance = parseInt(
    //     await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
    //   );
    //   for (let i = 0; i < tasks.length; i++) {
    //     expect(tasks[i].receipt).toBeTruthy();
    //     expect(tasks[i].transactionHash).toBeTruthy();
    //     expect(tasks[i].taskId).toBeTruthy();
    //     expect(tasks[i].ethStatus).toEqual(1);
    //     expect(tasks[i].proof).toBeFalsy();
    //   }
    //   expect(endingContractBalance - startingContractBalance).toEqual((tasks[0].gasLimit * tasks[0].gasPx) +
    //     (tasks[1].gasLimit * tasks[1].gasPx));
    // });
    //
    // it('should get the pending tasks', async () => {
    //   for (let i = 0; i < tasks.length; i++) {
    //     tasks[i] = await enigma.getTaskRecordStatus(tasks[i]);
    //     expect(tasks[i].ethStatus).toEqual(1);
    //   }
    // });
    //
    // let stateDeltaHashes;
    // let outputHashes;
    // it('should simulate multiple task receipts', async () => {
    //   const gasesUsed = [25, 10];
    //   const stateDeltaHash2 = web3.utils.soliditySha3('stateDeltaHash2');
    //   const stateDeltaHash3 = web3.utils.soliditySha3('stateDeltaHash3');
    //   stateDeltaHashes = [stateDeltaHash2, stateDeltaHash3];
    //   const outputHash2 = web3.utils.soliditySha3('outputHash2');
    //   const outputHash3 = web3.utils.soliditySha3('outputHash3');
    //   outputHashes = [outputHash2, outputHash3];
    //   const taskIds = tasks.map((task) => task.taskId);
    //   const inputsHashes = tasks.map((task) => task.inputsHash);
    //   const optionalEthereumData = '0x00';
    //   const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
    //   const proof = web3.utils.soliditySha3(
    //     {t: 'bytes32', v: codeHash},
    //     {t: 'bytes32[]', v: inputsHashes},
    //     {t: 'bytes32', v: stateDeltaHash},
    //     {t: 'bytes32[]', v: stateDeltaHashes},
    //     {t: 'bytes32[]', v: outputHashes},
    //     {t: 'uint[]', v: gasesUsed},
    //     {t: 'uint64', v: (optionalEthereumData.length - 2) / 2},
    //     {t: 'bytes', v: optionalEthereumData},
    //     {t: 'uint64', v: 20},
    //     {t: 'address', v: optionalEthereumContractAddress},
    //     {t: 'bytes1', v: '0x01'},
    //   );
    //   const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
    //   const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
    //   const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
    //   const sig = EthCrypto.sign(priv, proof);
    //   let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const startingWorkerBalance = worker.balance;
    //   const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
    //   const result = await new Promise((resolve, reject) => {
    //     enigma.enigmaContract.methods.commitReceipts(scAddr, taskIds, stateDeltaHashes, outputHashes,
    //       optionalEthereumData,
    //       optionalEthereumContractAddress, gasesUsed, sig).send({
    //       from: worker.account,
    //     }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
    //   });
    //   worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
    //   const endingWorkerBalance = worker.balance;
    //   const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
    //   expect(endingWorkerBalance - startingWorkerBalance).toEqual((gasesUsed[0] * tasks[0].gasPx) +
    //     (gasesUsed[1] * tasks[1].gasPx));
    //   expect(endingSenderBalance - startingSenderBalance).
    //     toEqual(((tasks[0].gasLimit - gasesUsed[0]) * tasks[0].gasPx) +
    //       ((tasks[1].gasLimit - gasesUsed[1]) * tasks[1].gasPx));
    //   expect(result.events.ReceiptsVerified).toBeTruthy();
    // });
    //
    // it('should get the confirmed tasks', async () => {
    //   for (let i = 0; i < tasks.length; i++) {
    //     tasks[i] = await enigma.getTaskRecordStatus(tasks[i]);
    //     expect(tasks[i].ethStatus).toEqual(2);
    //   }
    // });
    //
    // it('should get state delta hash range', async () => {
    //   const hashes = await enigma.admin.getStateDeltaHashes(scAddr, 0, 5);
    //   expect(hashes).toEqual([
    //     initStateDeltaHash, stateDeltaHash, stateDeltaHash, stateDeltaHashes[0],
    //     stateDeltaHashes[1]]);
    // });
    //
    // it('should get output hash range', async () => {
    //   const hashes = await enigma.admin.getOutputHashes(scAddr, 0, 4);
    //   expect(hashes).toEqual([outputHash, outputHash, outputHashes[0], outputHashes[1]]);
    // });
    //
    // it('should verify the report', async () => {
    //   let worker = data.workers[0];
    //
    //   let report = '0x' + Array.from(worker[1]).map((c) => c.charCodeAt(0).toString(16)).join('');
    //   let signature = '0x' + worker[3];
    //   const result = await enigma.enigmaContract.methods.verifyReport(report, signature).call();
    //
    //   expect(result).toEqual('0');
    // }, 40000);
    //
    // it('should fail the RPC Server', async () => {
    //   expect.assertions(15);
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('getWorkerEncryptionKey', {}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('deploySecretContract', {}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('deploySecretContract', {preCode: '1'}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('deploySecretContract', {preCode: '1', encryptedArgs: '1'}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('deploySecretContract', {preCode: '1', encryptedArgs: '1', encryptedFn: '1'},
    //       (err, response) => {
    //         if (err) {
    //           reject(err);
    //         }
    //         resolve(response);
    //       });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('deploySecretContract', {
    //       preCode: '1', encryptedArgs: '1', encryptedFn: '1',
    //       userDHKey: '0x1',
    //     }, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('sendTaskInput', {}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('sendTaskInput', {taskId: '1'}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('sendTaskInput', {taskId: '1', workerAddress: '0x1'}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('sendTaskInput', {taskId: '1', workerAddress: '0x1', encryptedFn: '1'},
    //       (err, response) => {
    //         if (err) {
    //           reject(err);
    //         }
    //         resolve(response);
    //       });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('sendTaskInput',
    //       {taskId: '1', workerAddress: '0x1', encryptedFn: '1', encryptedArgs: '1'},
    //       (err, response) => {
    //         if (err) {
    //           reject(err);
    //         }
    //         resolve(response);
    //       });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('sendTaskInput', {
    //       taskId: '1', workerAddress: '0x1', encryptedFn: '1', encryptedArgs: '1',
    //       contractAddress: '0x1',
    //     }, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('getTaskStatus', {taskId: '1'}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('getTaskStatus', {}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    //   await expect(new Promise((resolve, reject) => {
    //     enigma.client.request('getTaskResult', {}, (err, response) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       resolve(response);
    //     });
    //   })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    // });
  },
);
