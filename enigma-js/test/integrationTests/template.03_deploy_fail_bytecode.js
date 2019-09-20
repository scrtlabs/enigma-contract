/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import * as eeConstants from '../../src/emitterConstants';
import {EnigmaContract, EnigmaTokenContract} from './contractLoader';
import * as constants from './testConstants';


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

  let scTask1;
  const homedir = os.homedir();
  it('should deploy faulty secret contract', async () => {
    let scTaskFn = 'construct()';
    let scTaskArgs = '';
    let scTaskGasLimit = 100;
    let scTaskGasPx = utils.toGrains(1);
    let preCode = Buffer.from('5468697369736e6f746170726f706572736563726574636f6e74726163742e456e69676d6172756c65732e', 'hex');
    
    scTask1 = await new Promise((resolve, reject) => {
      enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode)
        .on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    });
  });

  it('should get the failed receipt', async () => {
    do {
      await sleep(1000);
      scTask1 = await enigma.getTaskRecordStatus(scTask1);
      process.stdout.write('Waiting. Current Task Status is '+scTask1.ethStatus+'\r');
    } while (scTask1.ethStatus != 3);
    expect(scTask1.ethStatus).toEqual(3);
    process.stdout.write('Completed. Final Task Status is '+scTask1.ethStatus+'\n');
  }, constants.TIMEOUT_FAILDEPLOY);

  it('should fail to verify deployed contract', async () => {
    const result = await enigma.admin.isDeployed(scTask1.scAddr);
    expect(result).toEqual(false);
  });

  it('should fail to get deployed contract bytecode hash', async () => {
    const result = await enigma.admin.getCodeHash(scTask1.scAddr);
    expect(result).toBeFalsy;
  });
});
