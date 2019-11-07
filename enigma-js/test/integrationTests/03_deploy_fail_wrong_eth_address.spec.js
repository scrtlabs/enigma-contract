/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import * as eeConstants from '../../src/emitterConstants';
import {EnigmaContract, EnigmaTokenContract, EnigmaContractAddress, EnigmaTokenContractAddress,
  proxyAddress, ethNodeAddr} from './contractLoader';
import * as constants from './testConstants';


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  it('initializes', () => {
    const provider = new Web3.providers.HttpProvider(ethNodeAddr);
    web3 = new Web3(provider);
    return web3.eth.getAccounts().then((result) => {
      accounts = result;
      enigma = new Enigma(
        web3,
        EnigmaContractAddress,
        EnigmaTokenContractAddress,
        proxyAddress,
        {
          gas: 4712388,
          gasPrice: 100000000000,
          from: accounts[0],
        },
      );
      enigma.admin();
      enigma.setTaskKeyPair('cupcake');
      expect(Enigma.version()).toEqual('0.0.1');
    });
  });

  let scTask;
  let task;
  const homedir = os.homedir();

  it('should deploy secret contract', async () => {
    let scTaskFn = `construct(address)`;
    let scTaskArgs = [
      ['0x0000000000000000000000000000000000000102', 'address'],
    ];
    let scTaskGasLimit = 4000000;
    let scTaskGasPx = utils.toGrains(1);
    let preCode;
    try {
      preCode = fs.readFileSync(path.resolve(__dirname,'secretContracts/voting.wasm'));
    } catch(e) {
      console.log('Error:', e.stack);
    }
    scTask = await new Promise((resolve, reject) => {
      enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode)
        .on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    });

    fs.writeFile(path.join(homedir, '.enigma', 'addr-voting-wrongeth.txt'), scTask.scAddr, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
  }, constants.TIMEOUT_DEPLOY);

  it('should get the confirmed deploy contract task', async () => {
    do {
      await sleep(1000);
      scTask = await enigma.getTaskRecordStatus(scTask);
      process.stdout.write('Waiting. Current Task Status is '+scTask.ethStatus+'\r');
    } while (scTask.ethStatus !== 2);
    expect(scTask.ethStatus).toEqual(2);
    process.stdout.write('Completed. Final Task Status is '+scTask.ethStatus+'\n');
  }, constants.TIMEOUT_DEPLOY);

  it('should verify deployed contract', async () => {
    const result = await enigma.admin.isDeployed(scTask.scAddr);
    expect(result).toEqual(true);
  });

  it('should get deployed contract bytecode hash', async () => {
    const result = await enigma.admin.getCodeHash(scTask.scAddr);
    expect(result).toBeTruthy();
    console.log('Deployed contract bytecode hash is: '+result);
  });
});
