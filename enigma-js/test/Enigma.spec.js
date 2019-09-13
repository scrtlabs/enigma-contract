/* eslint-disable require-jsdoc */
import dotenv from 'dotenv';
import Enigma from '../src/Enigma';
import utils from '../src/enigma-utils';
import forge from 'node-forge';
import Web3 from 'web3';
import JSBI from 'jsbi';
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
import {Buffer} from "buffer";

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
        const proof = utils.principalHash(JSBI.BigInt(seed).toString(16).padStart(64, '0'),
          JSBI.BigInt(0).toString(16).padStart(64, '0'), workerAddresses,
          workerStakes.map((workerStake) => JSBI.BigInt(workerStake).toString(16).padStart(64, '0')));
        const sig = EthCrypto.sign(data.principal[4], proof);
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

    it.skip('should fail to set worker params (principal only) since it already has during this epoch', async () => {
      const reason = 'Returned error: VM Exception while processing transaction: ' +
        'revert Already called during this epoch';
      if (process.env.PRINCIPAL_CONTAINER) {
        try {
          await execInContainer(enigma, '--set-worker-params');
        } catch (e) { // TODO: Capture the error output
          expect(e).toBeTruthy();
        }
      }
      const blockNumber = await web3.eth.getBlockNumber();
      let getActiveWorkersResult = await enigma.enigmaContract.methods.getActiveWorkers(blockNumber).call({
        from: accounts[8],
      });
      let workerAddresses = getActiveWorkersResult['0'];
      let workerStakes = getActiveWorkersResult['1'];
      const seed = Math.floor(Math.random() * 100000);
      const proof = utils.principalHash(JSBI.BigInt(seed).toString(16).padStart(64, '0'),
        JSBI.BigInt(1).toString(16).padStart(64, '0'), workerAddresses,
        workerStakes.map((workerStake) => JSBI.BigInt(workerStake).toString(16).padStart(64, '0')));
      const sig = EthCrypto.sign(data.principal[4], proof);
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

    it('should fail to register worker with same signing key', async () => {
      let worker = data.workers[0];
      const report = '0x' + Array.from(worker[1]).map((c) => c.charCodeAt(0).toString(16)).join('');
      const signature = '0x' + worker[3];

      await expect(new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.register(worker[0], report, signature).send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Not a unique signing key');
    }, 5000);

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
        const proof = utils.principalHash(JSBI.BigInt(seed).toString(16).padStart(64, '0'),
          JSBI.BigInt(1).toString(16).padStart(64, '0'), workerAddresses,
          workerStakes.map((workerStake) => JSBI.BigInt(workerStake).toString(16).padStart(64, '0')));
        const sig = EthCrypto.sign(data.principal[4], proof);

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
        toEqual([900, 100, 10, 20, 100, 200, 40].map((stake) => (JSBI.BigInt(stake * 10 ** 8))));
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
      preCode = Buffer.from('9d075aef', 'hex');
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
      preCode = Buffer.from('9d075aef', 'hex');
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
        preCode = Buffer.from('9d075aef', 'hex');
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
      preCode = Buffer.from('9d075aef', 'hex');
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
    it('should simulate the contract deployment failure', async () => {
      const gasUsed = 25;
      const proof = utils.hash([scTask.inputsHash, JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), '0x00']);
      const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.deploySecretContractFailure(scTask.taskId, '0x00', gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
      });
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * scTask.gasPx);
      expect(endingSenderBalance - startingSenderBalance).toEqual((scTask.gasLimit - gasUsed) * scTask.gasPx);
      expect(result.events.ReceiptFailed).toBeTruthy();
    });

    it('should fail to simulate contract deployment of already failed task', async () => {
      const gasUsed = 25;
      codeHash = web3.utils.soliditySha3('1a2b3c4d');
      initStateDeltaHash = web3.utils.soliditySha3('initialized');
      const optionalEthereumData = '0x';
      const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
      const proof = utils.hash([scTask.inputsHash, codeHash, initStateDeltaHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x00']);
      const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      await expect(new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.deploySecretContract(scTask.taskId, scTask.preCodeHash, codeHash,
          initStateDeltaHash, optionalEthereumData, optionalEthereumContractAddress, gasUsed, sig).send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Invalid task status');
    });

    it('should create/send deploy contract task using wrapper function', async () => {
      preCode = Buffer.from('9d075aef', 'hex');
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
      expect(scTask.nonce).toEqual(2);
      expect(scTask.receipt).toBeTruthy();
      expect(scTask.transactionHash).toBeTruthy();
      expect(scTask.taskId).toBeTruthy();
      expect(scTask.ethStatus).toEqual(1);
      expect(scTask.proof).toBeFalsy();
      expect(endingContractBalance - startingContractBalance).toEqual(scTask.gasLimit * scTask.gasPx);
      expect(scTask).toBeTruthy();
    });

    let firstSCAddr;
    it('should simulate the contract deployment', async () => {
      firstSCAddr = scTask.scAddr;
      const gasUsed = 25;
      codeHash = web3.utils.soliditySha3('1a2b3c4d');
      initStateDeltaHash = web3.utils.soliditySha3('initialized');
      const optionalEthereumData = '0x';
      const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
      const proof = utils.hash([
        scTask.inputsHash, codeHash, initStateDeltaHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(1);
      expect(sampleContractBool).toEqual(false);
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

    it('should count deployed secret contract addresses', async () => {
      const deployedSCAddrCount = await enigma.admin.countSecretContracts();
      expect(deployedSCAddrCount).toEqual(1);
    });

    it('should create/send a new deploy contract task using wrapper function to test eth call', async () => {
      preCode = Buffer.from('9d075aef', 'hex');
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
      expect(scTask.nonce).toEqual(3);
      expect(scTask.receipt).toBeTruthy();
      expect(scTask.transactionHash).toBeTruthy();
      expect(scTask.taskId).toBeTruthy();
      expect(scTask.ethStatus).toEqual(1);
      expect(scTask.proof).toBeFalsy();
      expect(endingContractBalance - startingContractBalance).toEqual(scTask.gasLimit * scTask.gasPx);
      expect(scTask).toBeTruthy();
    });

    it('should get the pending deploy contract task', async () => {
      scTask = await enigma.getTaskRecordStatus(scTask);
      expect(scTask.ethStatus).toEqual(1);
    });

    it('should fail to simulate the contract deployment with invalid eth call', async () => {
      const gasUsed = 25;
      codeHash = web3.utils.soliditySha3('1a2b3c4d');
      initStateDeltaHash = web3.utils.soliditySha3('initialized');
      const jsonInterface = {
        name: 'setStateVa',
        type: 'function',
        inputs: [
          {
            type: 'uint256',
            name: '_stateInt',
          }, {
            type: 'bool',
            name: '_stateBool',
          }],
      };
      const parameters = [5, true];
      const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
      const optionalEthereumContractAddress = sampleContract.options.address;
      const proof = utils.hash([
        scTask.inputsHash, codeHash, initStateDeltaHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(1);
      expect(sampleContractBool).toEqual(false);
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.deploySecretContract(scTask.taskId, scTask.preCodeHash, codeHash,
          initStateDeltaHash, optionalEthereumData, optionalEthereumContractAddress, gasUsed, sig).send({
          gas: 4712388,
          gasPrice: 100000000000,
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      });
      sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(1);
      expect(sampleContractBool).toEqual(false);
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(scTask.gasLimit * scTask.gasPx);
      expect(endingSenderBalance).toEqual(startingSenderBalance);
      expect(result.events.ReceiptFailedETH).toBeTruthy();
    });

    it('should simulate the contract deployment with eth call', async () => {
      preCode = Buffer.from('9d075aef', 'hex');
      let scTaskFn = 'deployContract(string,uint)';
      let scTaskArgs = [
        ['first_sc', 'string'],
        [1, 'uint'],
      ];
      let scTaskGasLimit = 100;
      let scTaskGasPx = utils.toGrains(1);
      scTask = await new Promise((resolve, reject) => {
        enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode).
        on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt)).
        on(eeConstants.ERROR, (error) => reject(error));
      });
      const gasUsed = 25;
      codeHash = web3.utils.soliditySha3('1a2b3c4d');
      initStateDeltaHash = web3.utils.soliditySha3('initialized');
      const jsonInterface = {
        name: 'setStateVar',
        type: 'function',
        inputs: [
          {
            type: 'uint256',
            name: '_stateInt',
          }, {
            type: 'bool',
            name: '_stateBool',
          }],
      };
      const parameters = [5, true];
      const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
      const optionalEthereumContractAddress = sampleContract.options.address;
      const proof = utils.hash([
        scTask.inputsHash, codeHash, initStateDeltaHash, JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'),
        optionalEthereumData, optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(scTask.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(1);
      expect(sampleContractBool).toEqual(false);
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
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(scTask.gasLimit * scTask.gasPx);
      expect(endingSenderBalance).toEqual(startingSenderBalance);
      expect(result.events.SecretContractDeployed).toBeTruthy();
    });

    it('should retrieve deployed secret contract addresses', async () => {
      const deployedSCAddrCount = await enigma.admin.countSecretContracts();
      const deployedSCAddresses = await enigma.admin.getSecretContractAddresses(1, 2);
      const allDeployedSCAddresses = await enigma.admin.getAllSecretContractAddresses();
      expect(deployedSCAddrCount).toEqual(2);
      expect(deployedSCAddresses).toEqual([scTask.scAddr]);
      expect(allDeployedSCAddresses).toEqual([firstSCAddr, scTask.scAddr]);
    });

    it('should count state deltas after contract deployment', async () => {
      const count = await enigma.admin.countStateDeltas(scTask.scAddr);
      expect(count).toEqual(1);
    });

    it('should get the confirmed deploy contract task', async () => {
      scTask = await enigma.getTaskRecordStatus(scTask);
      expect(scTask.ethStatus).toEqual(2);
    });

    it('should verify deployed contract', async () => {
      const result = await enigma.admin.isDeployed(scTask.scAddr);
      expect(result).toEqual(true);
    });

    it('should get deployed contract bytecode hash', async () => {
      const result = await enigma.admin.getCodeHash(scTask.scAddr);
      expect(result).toEqual(codeHash);
    });

    it('should set the worker parameters (principal only) again for a second new epoch', async () => {
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
        const proof = utils.principalHash(web3.utils.toBN(seed).toString(16, 64), web3.utils.toBN(2).toString(16, 64),
          workerAddresses, workerStakes.map((workerStake) => web3.utils.toBN(workerStake).toString(16, 64)));
        const sig = EthCrypto.sign(data.principal[4], proof);

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

    it('should simulate getting the state keys for the contract / epoch', async () => {
      if (process.env.PRINCIPAL_CONTAINER) {
        const workerParams = await enigma.getWorkerParams(scTask.creationBlockNumber);
        console.log('Selecting worker with params', 'workers:', workerParams.workers,
          'stakes:', workerParams.stakes.map((s) => web3.utils.numberToHex(s)),
          'seed:', web3.utils.numberToHex(workerParams.seed));
        const selectedWorkerAddr = (await enigma.selectWorkerGroup(scTask.scAddr, workerParams, 1))[0];
        console.log('The selected worker:', selectedWorkerAddr);
        const worker = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase());
        const stateKeys = await getStateKeysInContainer(enigma, worker, [scTask.scAddr]);
        console.log('the response', stateKeys);
      } else {
        console.log('Getting state keys requires the live Principal container.');
      }
    });

    let scAddr;
    let task;
    it('should create task', async () => {
      scAddr = scTask.scAddr;
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      task = await new Promise((resolve, reject) => {
        enigma.createTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr, false).
          on(eeConstants.CREATE_TASK, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(task).toBeTruthy();
      expect(task.scAddr).toBeTruthy();
      expect(task.preCode).toEqual('');
      expect(task.preCodeHash).toEqual('');
      expect(task.encryptedFn).toBeTruthy();
      expect(task.encryptedAbiEncodedArgs).toBeTruthy();
      expect(task.gasLimit).toEqual(taskGasLimit);
      expect(task.gasPx).toEqual(taskGasPx);
      expect(task.msgId).toBeTruthy();
      expect(task.sender).toEqual(accounts[0]);
      const msg = web3.utils.soliditySha3(
        {t: 'bytes', v: task.encryptedFn},
        {t: 'bytes', v: task.encryptedAbiEncodedArgs},
      );
      expect(enigma.web3.eth.accounts.recover(msg, task.userTaskSig)).toEqual(accounts[0]);
      expect(task.nonce).toEqual(5);
    });

    it('should create task record', async () => {
      const startingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      task = await new Promise((resolve, reject) => {
        enigma.createTaskRecord(task).
          on(eeConstants.CREATE_TASK_RECORD, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      const endingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      expect(task.receipt).toBeTruthy();
      expect(task.transactionHash).toBeTruthy();
      expect(task.taskId).toBeTruthy();
      expect(task.ethStatus).toEqual(1);
      expect(task.proof).toBeFalsy();
      expect(endingContractBalance - startingContractBalance).toEqual(task.gasLimit * task.gasPx);
    });

    it('should send task inputs to Enigma network', async () => {
      task = await new Promise((resolve, reject) => {
        enigma.sendTaskInput(task).
          on(eeConstants.SEND_TASK_INPUT_RESULT, (receipt) => resolve(receipt)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(task).toBeTruthy();
    });

    it('should fail to create/send compute task using wrapper function because of failed worker encryption ' +
      'key rpc call', async () => {
      server.close(true);
      const consoleError = console.error; // save original console for future use
      console.error = jest.fn(); // mock console output to be disregarded, we know the following will error out
      scAddr = scTask.scAddr;
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      await expect(new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
          on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual({code: -32000, message: 'Network Error'});
      console.error = consoleError; // restore the original console
      server.listen();
    });

    it('should fail to create/send deploy contract task using wrapper function due to insufficient funds',
      async () => {
        scAddr = scTask.scAddr;
        let taskFn = 'medianWealth(int32,int32)';
        let taskArgs = [
          [200000, 'int32'],
          [300000, 'int32'],
        ];
        let taskGasLimit = 901;
        let taskGasPx = utils.toGrains(1);
        await expect(new Promise((resolve, reject) => {
          enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[1], scAddr).
            on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
            on(eeConstants.ERROR, (error) => reject(error));
        })).rejects.toEqual({message: 'Not enough tokens to pay the fee', name: 'NotEnoughTokens'});
      });

    it('should fail to poll the network because of failed rpc call', async () => {
      server.close(true);
      const consoleError = console.error; // save original console for future use
      console.error = jest.fn(); // mock console output to be disregarded, we know the following will error out
      let taskStatuses = [];
      await expect(new Promise((resolve, reject) => {
        enigma.pollTaskStatus(task).on(eeConstants.POLL_TASK_INPUT_RESULT, (result) => {
          taskStatuses.push(result.engStatus);
          if (result.engStatus === 'SUCCESS') {
            resolve();
          }
        }).on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual({code: -32000, message: 'Network Error'});
      console.error = consoleError; // restore the original console
      server.listen();
    });

    it('should poll the network until task confirmed without result', async () => {
      let taskStatuses = [];
      task = await new Promise((resolve, reject) => {
        enigma.pollTaskStatus(task).on(eeConstants.POLL_TASK_STATUS_RESULT, (result) => {
          taskStatuses.push(result.engStatus);
          if (result.engStatus === 'SUCCESS') {
            resolve(result);
          }
        }).on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(task.encryptedAbiEncodedOutputs).toBeFalsy();
      expect(taskStatuses).toEqual(['INPROGRESS', 'INPROGRESS', 'INPROGRESS', 'INPROGRESS', 'SUCCESS']);
    });

    it('should poll the network until task confirmed with result', async () => {
      server.resetCounter();
      let taskStatuses = [];
      task = await new Promise((resolve, reject) => {
        enigma.pollTaskStatus(task, true).on(eeConstants.POLL_TASK_STATUS_RESULT, (result) => {
          taskStatuses.push(result.engStatus);
          if (result.engStatus === 'SUCCESS') {
            resolve(result);
          }
        }).on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(task.encryptedAbiEncodedOutputs).toBeTruthy();
      expect(taskStatuses).toEqual(['INPROGRESS', 'INPROGRESS', 'INPROGRESS', 'INPROGRESS', 'SUCCESS']);
    });

    it('should get task result with invalid return status', async () => {
      server.resetCounter();
      await expect(new Promise((resolve, reject) => {
        enigma.getTaskResult(task).
          on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual('Invalid task result status');
    });

    it('should get task result of nonexistant task', async () => {
      task = await new Promise((resolve, reject) => {
        enigma.getTaskResult(task).
          on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(task.engStatus).toEqual(null);
    });

    it('should create/send compute task using wrapper function', async () => {
      scAddr = scTask.scAddr;
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      const startingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      task = await new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
          on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      const endingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      expect(task).toBeTruthy();
      expect(task.scAddr).toBeTruthy();
      expect(task.preCode).toEqual('');
      expect(task.preCodeHash).toEqual('');
      expect(task.encryptedFn).toBeTruthy();
      expect(task.encryptedAbiEncodedArgs).toBeTruthy();
      expect(task.gasLimit).toEqual(taskGasLimit);
      expect(task.gasPx).toEqual(taskGasPx);
      expect(task.msgId).toBeTruthy();
      expect(task.sender).toEqual(accounts[0]);
      const msg = web3.utils.soliditySha3(
        {t: 'bytes', v: task.encryptedFn},
        {t: 'bytes', v: task.encryptedAbiEncodedArgs},
      );
      expect(enigma.web3.eth.accounts.recover(msg, task.userTaskSig)).toEqual(accounts[0]);
      expect(task.nonce).toEqual(6);
      expect(task.receipt).toBeTruthy();
      expect(task.transactionHash).toBeTruthy();
      expect(task.taskId).toBeTruthy();
      expect(task.ethStatus).toEqual(1);
      expect(task.proof).toBeFalsy();
      expect(endingContractBalance - startingContractBalance).toEqual(task.gasLimit * task.gasPx);
    });

    it('should get task result of unverified task', async () => {
      task = await new Promise((resolve, reject) => {
        enigma.getTaskResult(task).
          on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(task.engStatus).toEqual('UNVERIFIED');
    });

    it('should get task result of inprogress task', async () => {
      task = await new Promise((resolve, reject) => {
        enigma.getTaskResult(task).
          on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(task.engStatus).toEqual('INPROGRESS');
    });

    it('should fail to get task result because of failed rpc call', async () => {
      server.close(true);
      const consoleError = console.error; // save original console for future use
      console.error = jest.fn(); // mock console output to be disregarded, we know the following will error out
      await expect(new Promise((resolve, reject) => {
        enigma.getTaskResult(task).
          on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual({code: -32000, message: 'Network Error'});
      console.error = consoleError; // restore the original console
      server.listen();
    });

    it('should get task result of failed task', async () => {
      task = await new Promise((resolve, reject) => {
        enigma.getTaskResult(task).
          on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      expect(task.engStatus).toEqual('FAILED');
      expect(task.encryptedAbiEncodedOutputs).toBeTruthy();
      expect(task.usedGas).toBeTruthy();
      expect(task.workerTaskSig).toBeTruthy();
    });

    let encryptedAbiEncodedOutputs;
    let engStatus;
    it('should get task result of successful computation', async () => {
      task = await new Promise((resolve, reject) => {
        enigma.getTaskResult(task).
          on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      engStatus = task.engStatus;
      expect(task.engStatus).toEqual('SUCCESS');
      encryptedAbiEncodedOutputs = task.encryptedAbiEncodedOutputs;
      expect(task.encryptedAbiEncodedOutputs).toBeTruthy();
      expect(task.delta).toBeTruthy();
      expect(task.usedGas).toBeTruthy();
      expect(task.ethereumPayload).toBeTruthy();
      expect(task.ethereumAddress).toBeTruthy();
      expect(task.workerTaskSig).toBeTruthy();
    });

    it('should decrypt task result', async () => {
      try {
        task = await enigma.decryptTaskResult(task);
        expect(task.decryptedOutput).toBeTruthy();
      } catch (err) {
        expect(err.message).toEqual('decipher did not finish');
      }
    });

    it('should get the pending task', async () => {
      task = await enigma.getTaskRecordStatus(task);
      expect(task.ethStatus).toEqual(1);
    });

    it('should simulate the task failure', async () => {
      const gasUsed = 25;
      const proof = utils.hash([
        task.inputsHash, codeHash, JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), '0x00']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitTaskFailure(scAddr, task.taskId, web3.utils.soliditySha3('failure'),
          gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error));
      });
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * task.gasPx);
      expect(endingSenderBalance - startingSenderBalance).toEqual((task.gasLimit - gasUsed) * task.gasPx);
      expect(result.events.ReceiptFailed).toBeTruthy();
    });

    it('should count state deltas after task failure', async () => {
      const count = await enigma.admin.countStateDeltas(scAddr);
      expect(count).toEqual(1);
    });

    it('should get the failed ENG task', async () => {
      task = await enigma.getTaskRecordStatus(task);
      expect(task.ethStatus).toEqual(3);
    });

    let stateDeltaHash;
    let outputHash;
    it('should fail to simulate the task receipt of already failed task', async () => {
      const gasUsed = 25;
      stateDeltaHash = web3.utils.soliditySha3('stateDeltaHash1');
      outputHash = web3.utils.soliditySha3('outputHash1');
      const optionalEthereumData = '0x00';
      const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
      const proof = utils.hash([
        codeHash, task.inputsHash, initStateDeltaHash, stateDeltaHash, outputHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      const worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      await expect(new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
          optionalEthereumData,
          optionalEthereumContractAddress, gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Invalid task status');
    });

    it('should fail to create/send compute task using wrapper function due to insufficient funds', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 901;
      let taskGasPx = utils.toGrains(1);
      await expect(new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[1], scAddr).
          on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual({message: 'Not enough tokens to pay the fee', name: 'NotEnoughTokens'});
    });

    it('should simulate successful task receipt without state delta', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      task = await new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr)
          .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
          .on(eeConstants.ERROR, (error) => reject(error));
      });
      const gasUsed = 25;
      const optionalEthereumData = '0x';
      const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
      stateDeltaHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const proof = utils.hash([
        codeHash, task.inputsHash, initStateDeltaHash, stateDeltaHash, outputHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData, optionalEthereumContractAddress,
        '0x01']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
          optionalEthereumData,
          optionalEthereumContractAddress, gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      });
      sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * task.gasPx);
      expect(endingSenderBalance - startingSenderBalance).toEqual((task.gasLimit - gasUsed) * task.gasPx);
      expect(result.events.ReceiptVerified).toBeTruthy();
    });

    it('should count state deltas', async () => {
      const count = await enigma.admin.countStateDeltas(scAddr);
      expect(count).toEqual(1);
    });

    it('should get output hash', async () => {
      const output = await enigma.getTaskOutputHash(task);
      task.encryptedAbiEncodedOutputs = enigma.web3.utils.toHex('outputHash1');
      task.engStatus = 'SUCCESS';
      expect(outputHash).toEqual(output);
      const verifyTaskOutput = await enigma.verifyTaskOutput(task);
      const verifyTaskStatus = await enigma.verifyTaskStatus(task);
      expect(verifyTaskOutput).toEqual(true);
      expect(verifyTaskStatus).toEqual(true);
    });

    it('should simulate successful task receipt with state delta', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      task = await new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
        on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
        on(eeConstants.ERROR, (error) => reject(error));
      });
      const gasUsed = 25;
      const optionalEthereumData = '0x';
      const optionalEthereumContractAddress = '0x0000000000000000000000000000000000000000';
      stateDeltaHash = web3.utils.soliditySha3('stateDeltaHash1');
      const proof = utils.hash([
        codeHash, task.inputsHash, initStateDeltaHash, stateDeltaHash, outputHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
          optionalEthereumData,
          optionalEthereumContractAddress, gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      });
      sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(gasUsed * task.gasPx);
      expect(endingSenderBalance - startingSenderBalance).toEqual((task.gasLimit - gasUsed) * task.gasPx);
      expect(result.events.ReceiptVerified).toBeTruthy();
    });

    it('should poll ETH for task', async () => {
      task = await enigma.pollTaskETH(task);
      expect(task.ethStatus).toEqual(2);
    });

    it('should count state deltas after task failure', async () => {
      const count = await enigma.admin.countStateDeltas(scAddr);
      expect(count).toEqual(2);
    });

    it('should get the confirmed task', async () => {
      task = await enigma.getTaskRecordStatus(task);
      expect(task.ethStatus).toEqual(2);
    });

    it('should get output hash', async () => {
      const output = await enigma.getTaskOutputHash(task);
      expect(outputHash).toEqual(output);
    });

    it('should create/send a new compute task using wrapper function with eth call', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      const startingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      task = await new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
          on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      const endingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      expect(task).toBeTruthy();
      expect(task.scAddr).toBeTruthy();
      expect(task.preCode).toEqual('');
      expect(task.preCodeHash).toEqual('');
      expect(task.encryptedFn).toBeTruthy();
      expect(task.encryptedAbiEncodedArgs).toBeTruthy();
      expect(task.gasLimit).toEqual(taskGasLimit);
      expect(task.gasPx).toEqual(taskGasPx);
      expect(task.msgId).toBeTruthy();
      expect(task.sender).toEqual(accounts[0]);
      const msg = web3.utils.soliditySha3(
        {t: 'bytes', v: task.encryptedFn},
        {t: 'bytes', v: task.encryptedAbiEncodedArgs},
      );
      expect(enigma.web3.eth.accounts.recover(msg, task.userTaskSig)).toEqual(accounts[0]);
      expect(task.nonce).toEqual(9);
      expect(task.receipt).toBeTruthy();
      expect(task.transactionHash).toBeTruthy();
      expect(task.taskId).toBeTruthy();
      expect(task.ethStatus).toEqual(1);
      expect(task.proof).toBeFalsy();
      expect(endingContractBalance - startingContractBalance).toEqual(task.gasLimit * task.gasPx);
    });

    it('should simulate task receipt with invalid eth call', async () => {
      const gasUsed = 25;
      const jsonInterface = {
        name: 'setStateVa',
        type: 'function',
        inputs: [
          {
            type: 'uint256',
            name: '_stateInt',
          }, {
            type: 'bool',
            name: '_stateBool',
          }],
      };
      const parameters = [10, false];
      const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
      const optionalEthereumContractAddress = sampleContract.options.address;
      const proof = utils.hash([
        codeHash, task.inputsHash, stateDeltaHash, stateDeltaHash, outputHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData, optionalEthereumContractAddress,
        '0x01']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
          optionalEthereumData,
          optionalEthereumContractAddress, gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      });
      sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(task.gasLimit * task.gasPx);
      expect(endingSenderBalance).toEqual(startingSenderBalance);
      expect(result.events.ReceiptFailedETH).toBeTruthy();
    });

    it('should count state deltas after task failure', async () => {
      const count = await enigma.admin.countStateDeltas(scAddr);
      expect(count).toEqual(2);
    });

    it('should get the failed ETH task', async () => {
      task = await enigma.getTaskRecordStatus(task);
      expect(task.ethStatus).toEqual(4);
    });

    it('should fail to simulate task receipt with eth call that reverts', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      task = await new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
        on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
        on(eeConstants.ERROR, (error) => reject(error));
      });
      const gasUsed = 25;
      const jsonInterface = {
        name: 'setStateVarRevert',
        type: 'function',
        inputs: [
          {
            type: 'uint256',
            name: '_stateInt',
          }, {
            type: 'bool',
            name: '_stateBool',
          }],
      };
      const parameters = [10, false];
      const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
      const optionalEthereumContractAddress = sampleContract.options.address;
      const proof = utils.hash([
        codeHash, task.inputsHash, stateDeltaHash, stateDeltaHash,
        outputHash, JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
          optionalEthereumData,
          optionalEthereumContractAddress, gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      });
      sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(task.gasLimit * task.gasPx);
      expect(endingSenderBalance).toEqual(startingSenderBalance);
      expect(result.events.ReceiptFailedETH).toBeTruthy();
    });

    it('should count state deltas after task failure', async () => {
      const count = await enigma.admin.countStateDeltas(scAddr);
      expect(count).toEqual(2);
    });

    it('should get the failed ETH task', async () => {
      task = await enigma.getTaskRecordStatus(task);
      expect(task.ethStatus).toEqual(4);
    });

    let gasUsedEthCall;
    it('should simulate task receipt with eth call', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      task = await new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
        on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
        on(eeConstants.ERROR, (error) => reject(error));
      });
      const gasUsed = 25;
      const jsonInterface = {
        name: 'setStateVar',
        type: 'function',
        inputs: [
          {
            type: 'uint256',
            name: '_stateInt',
          }, {
            type: 'bool',
            name: '_stateBool',
          }],
      };
      const parameters = [10, false];
      const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
      const optionalEthereumContractAddress = sampleContract.options.address;
      const proof = utils.hash([
        codeHash, task.inputsHash, stateDeltaHash, stateDeltaHash, outputHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(5);
      expect(sampleContractBool).toEqual(true);
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
          optionalEthereumData,
          optionalEthereumContractAddress, gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      });
      gasUsedEthCall = result.gasUsed;
      sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(10);
      expect(sampleContractBool).toEqual(false);
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(
        (await enigma.tokenContract.methods.balanceOf(task.sender).call()),
      );
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(task.gasLimit * task.gasPx);
      expect(endingSenderBalance).toEqual(startingSenderBalance);
      expect(result.events.ReceiptVerified).toBeTruthy();
    });

    it('should get the confirmed task', async () => {
      task = await enigma.getTaskRecordStatus(task);
      expect(task.ethStatus).toEqual(2);
    });

    it('should count state deltas', async () => {
      const count = await enigma.admin.countStateDeltas(scAddr);
      expect(count).toEqual(3);
    });

    it('should get state delta hash', async () => {
      const delta = await enigma.admin.getStateDeltaHash(scAddr, 2);
      expect(stateDeltaHash).toEqual(delta);
    });

    it('should verify state delta', async () => {
      const isValid = await enigma.admin.isValidDeltaHash(scAddr, stateDeltaHash);
      expect(isValid).toEqual(true);
    });

    it('should get output hash', async () => {
      const output = await enigma.getTaskOutputHash(task);
      expect(outputHash).toEqual(output);
    });

    it('should fail to simulate task receipt with insufficient gas from worker', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      task = await new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
        on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
        on(eeConstants.ERROR, (error) => reject(error));
      });
      const gasUsed = 25;
      const jsonInterface = {
        name: 'setStateVarGasFail',
        type: 'function',
        inputs: [
          {
            type: 'uint256',
            name: '_stateInt',
          }, {
            type: 'bool',
            name: '_stateBool',
          }],
      };
      const parameters = [10, false];
      const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
      const optionalEthereumContractAddress = sampleContract.options.address;
      const proof = utils.hash([
        codeHash, task.inputsHash, stateDeltaHash, stateDeltaHash, outputHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      await expect(new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
          optionalEthereumData,
          optionalEthereumContractAddress, gasUsed, sig).send({
          from: worker.account,
          gasLimit: 300000,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      })).rejects.toEqual('Returned error: VM Exception while processing transaction: revert Not enough gas from ' +
        'worker for minimum eth callback');
    });

    it('should fail to simulate task receipt with eth call that exceeds gas limit', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskArgs = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      task = await new Promise((resolve, reject) => {
        enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], scAddr).
        on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result)).
        on(eeConstants.ERROR, (error) => reject(error));
      });
      const gasUsed = 25;
      const jsonInterface = {
        name: 'setStateVarGasFail',
        type: 'function',
        inputs: [
          {
            type: 'uint256',
            name: '_stateInt',
          }, {
            type: 'bool',
            name: '_stateBool',
          }],
      };
      const parameters = [10, false];
      const optionalEthereumData = enigma.web3.eth.abi.encodeFunctionCall(jsonInterface, parameters);
      const optionalEthereumContractAddress = sampleContract.options.address;
      const proof = utils.hash([
        codeHash, task.inputsHash, stateDeltaHash, stateDeltaHash, outputHash,
        JSBI.BigInt(gasUsed).toString(16).padStart(16, '0'), optionalEthereumData,
        optionalEthereumContractAddress, '0x01']);
      const workerParams = await enigma.getWorkerParams(task.creationBlockNumber);
      const selectedWorkerAddr = (await enigma.selectWorkerGroup(task.scAddr, workerParams, 1))[0];
      const priv = data.workers.find((w) => w[0] === selectedWorkerAddr.toLowerCase())[4];
      const sig = EthCrypto.sign(priv, proof);
      let worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const startingWorkerBalance = worker.balance;
      const startingSenderBalance = parseInt(await enigma.tokenContract.methods.balanceOf(task.sender).call());
      let sampleContractInt = parseInt(await sampleContract.methods.stateInt().call());
      let sampleContractBool = await sampleContract.methods.stateBool().call();
      expect(sampleContractInt).toEqual(10);
      expect(sampleContractBool).toEqual(false);
      const result = await new Promise((resolve, reject) => {
        enigma.enigmaContract.methods.commitReceipt(scAddr, task.taskId, stateDeltaHash, outputHash,
          optionalEthereumData,
          optionalEthereumContractAddress, gasUsed, sig).send({
          from: worker.account,
        }).on('receipt', (receipt) => resolve(receipt)).on('error', (error) => reject(error.message));
      });
      worker = await enigma.admin.findBySigningAddress(selectedWorkerAddr);
      const endingWorkerBalance = worker.balance;
      const endingSenderBalance = parseInt(
        (await enigma.tokenContract.methods.balanceOf(task.sender).call()),
      );
      expect(endingWorkerBalance - startingWorkerBalance).toEqual(task.gasLimit * task.gasPx);
      expect(endingSenderBalance).toEqual(startingSenderBalance);
      expect(result.events.ReceiptFailedETH).toBeTruthy();
    });

    it('should get the confirmed task', async () => {
      task = await enigma.getTaskRecordStatus(task);
      expect(task.ethStatus).toEqual(4);
    });

    it('should count state deltas', async () => {
      const count = await enigma.admin.countStateDeltas(scAddr);
      expect(count).toEqual(3);
    });

    it('should fail to create task records due to insufficient funds', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskGasLimit = 500;
      let taskGasPx = utils.toGrains(1);
      let taskArgsA = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskArgsB = [
        [1000000, 'int32'],
        [2000000, 'int32'],
      ];
      let taskA = await new Promise((resolve, reject) => {
        enigma.createTask(taskFn, taskArgsA, taskGasLimit, taskGasPx, accounts[1], scAddr, false).
          on(eeConstants.CREATE_TASK, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      let taskB = await new Promise((resolve, reject) => {
        enigma.createTask(taskFn, taskArgsB, taskGasLimit, taskGasPx, accounts[1], scAddr, false).
          on(eeConstants.CREATE_TASK, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      await expect(new Promise((resolve, reject) => {
        enigma.createTaskRecords([taskA, taskB]).
          on(eeConstants.CREATE_TASK_RECORDS, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      })).rejects.toEqual({message: 'Not enough tokens to pay the fee', name: 'NotEnoughTokens'});
    });

    let tasks;
    it('should create multiple task records', async () => {
      let taskFn = 'medianWealth(int32,int32)';
      let taskGasLimit = 100;
      let taskGasPx = utils.toGrains(1);
      let taskArgsA = [
        [200000, 'int32'],
        [300000, 'int32'],
      ];
      let taskArgsB = [
        [1000000, 'int32'],
        [2000000, 'int32'],
      ];
      let taskA = await new Promise((resolve, reject) => {
        enigma.createTask(taskFn, taskArgsA, taskGasLimit, taskGasPx, accounts[0], scAddr, false).
          on(eeConstants.CREATE_TASK, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      let taskB = await new Promise((resolve, reject) => {
        enigma.createTask(taskFn, taskArgsB, taskGasLimit, taskGasPx, accounts[0], scAddr, false).
          on(eeConstants.CREATE_TASK, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      tasks = [taskA, taskB];
      const startingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      tasks = await new Promise((resolve, reject) => {
        enigma.createTaskRecords(tasks).
          on(eeConstants.CREATE_TASK_RECORDS, (result) => resolve(result)).
          on(eeConstants.ERROR, (error) => reject(error));
      });
      const endingContractBalance = parseInt(
        await enigma.tokenContract.methods.balanceOf(enigma.enigmaContract.options.address).call(),
      );
      for (let i = 0; i < tasks.length; i++) {
        expect(tasks[i].receipt).toBeTruthy();
        expect(tasks[i].transactionHash).toBeTruthy();
        expect(tasks[i].taskId).toBeTruthy();
        expect(tasks[i].ethStatus).toEqual(1);
        expect(tasks[i].proof).toBeFalsy();
      }
      expect(endingContractBalance - startingContractBalance).toEqual((tasks[0].gasLimit * tasks[0].gasPx) +
        (tasks[1].gasLimit * tasks[1].gasPx));
    });

    it('should get the pending tasks', async () => {
      for (let i = 0; i < tasks.length; i++) {
        tasks[i] = await enigma.getTaskRecordStatus(tasks[i]);
        expect(tasks[i].ethStatus).toEqual(1);
      }
    });

    it('should verify the report', async () => {
      let worker = data.workers[0];

      let report = '0x' + Array.from(worker[1]).map((c) => c.charCodeAt(0).toString(16)).join('');
      let signature = '0x' + worker[3];
      const result = await enigma.enigmaContract.methods.verifyReport(report, signature).call();

      expect(result).toEqual('0');
    }, 40000);

    it('should fail the RPC Server', async () => {
      expect.assertions(15);
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('getWorkerEncryptionKey', {}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('deploySecretContract', {}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('deploySecretContract', {preCode: '1'}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('deploySecretContract', {preCode: '1', encryptedArgs: '1'}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('deploySecretContract', {preCode: '1', encryptedArgs: '1', encryptedFn: '1'},
          (err, response) => {
            if (err) {
              reject(err);
            }
            resolve(response);
          });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('deploySecretContract', {
          preCode: '1', encryptedArgs: '1', encryptedFn: '1',
          userDHKey: '0x1',
        }, (err, response) => {
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
        enigma.client.request('sendTaskInput', {taskId: '1', workerAddress: '0x1'}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('sendTaskInput', {taskId: '1', workerAddress: '0x1', encryptedFn: '1'},
          (err, response) => {
            if (err) {
              reject(err);
            }
            resolve(response);
          });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('sendTaskInput',
          {taskId: '1', workerAddress: '0x1', encryptedFn: '1', encryptedArgs: '1'},
          (err, response) => {
            if (err) {
              reject(err);
            }
            resolve(response);
          });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('sendTaskInput', {
          taskId: '1', workerAddress: '0x1', encryptedFn: '1', encryptedArgs: '1',
          contractAddress: '0x1',
        }, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('getTaskStatus', {taskId: '1'}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('getTaskStatus', {}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
      await expect(new Promise((resolve, reject) => {
        enigma.client.request('getTaskResult', {}, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      })).rejects.toEqual({code: -32602, message: 'Invalid params'});
    });
  },
);
