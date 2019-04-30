/* eslint-disable require-jsdoc */
import fs from 'fs';
import os from 'os';
import path from 'path';
import forge from 'node-forge';
import Web3 from 'web3';
import Enigma from '../../src/Enigma';
import utils from '../../src/enigma-utils';
import EnigmaContract from '../../../build/contracts/Enigma';
import EnigmaTokenContract from '../../../build/contracts/EnigmaToken';
import VotingETHContract from '../../../build/contracts/VotingETH';
import * as eeConstants from '../../src/emitterConstants';
import data from '../data';
import EthCrypto from 'eth-crypto';
import SampleContract from "../../../build/contracts/Sample";


forge.options.usePureJavaScript = true;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  let votingETHContract;
  let epochSize;
  it('initializes', () => {
    const provider = new Web3.providers.HttpProvider('http://localhost:9545');
    web3 = new Web3(provider);
    return web3.eth.getAccounts().then((result) => {
      accounts = result;
      console.log('the accounts', accounts);
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

  it('initializes VotingETH contract', async () => {
    votingETHContract = new enigma.web3.eth.Contract(VotingETHContract['abi'],
      VotingETHContract.networks['4447'].address);
    expect(votingETHContract.options.address).toBeTruthy();
  });

  let scTask;
  let task;
  const homedir = os.homedir();
  it('should deploy secret contract', async () => {
    let scTaskFn = `construct(address)`;
    let scTaskArgs = [
      [votingETHContract.options.address, 'address'],
    ];
    let scTaskGasLimit = 4000000;
    let scTaskGasPx = utils.toGrains(1);
    let preCode;
    try {
      preCode = fs.readFileSync(path.resolve(__dirname,'secretContracts/voting.wasm'));
      preCode = preCode.toString('hex');
    } catch(e) {
      console.log('Error:', e.stack);
    }
    scTask = await new Promise((resolve, reject) => {
      enigma.deploySecretContract(scTaskFn, scTaskArgs, scTaskGasLimit, scTaskGasPx, accounts[0], preCode)
        .on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt))
        .on(eeConstants.ERROR, (error) => reject(error));
    });

    fs.writeFile(path.join(homedir, '.enigma', 'addr-voting.txt'), scTask.scAddr, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
  });

  it('should get the confirmed deploy contract task', async () => {
    do {
      scTask = await enigma.getTaskRecordStatus(scTask);
      console.log(scTask.ethStatus);
      await sleep(1000);
    } while (scTask.ethStatus != 2);
    expect(scTask.ethStatus).toEqual(2);
  }, 10000);

  it('should verify deployed contract', async () => {
    const result = await enigma.admin.isDeployed(scTask.scAddr);
    expect(result).toEqual(true);
  });

  it('should get deployed contract bytecode hash', async () => {
    const result = await enigma.admin.getCodeHash(scTask.scAddr);
    expect(result).toBeTruthy;
    console.log('Deployed contract bytecode hash is:')
    console.log(result);
  });
});
