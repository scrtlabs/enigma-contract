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

describe('Enigma tests', () => {
  let accounts;
  let web3;
  let enigma;
  const GAS_PRICE = '10000000000000';
  const GAS = 1000000;
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
          from: accounts[0],
          gasPrice: GAS_PRICE,
          gas: GAS,
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
          send({from: accounts[i], gasPrice: GAS_PRICE, gas: GAS}).
          on('receipt', (receipt) => resolve(receipt)).
          on('error', (error) => reject(error));
      });
      promises.push(promise);
    }
    // Using the account as the signer for testing purposes
    return Promise.all(promises).then((receipts) => {
      receipts.forEach((receipt) => {
        console.log('worker registered: ', receipt);
      });
    });
  });

  it('create task record', () => {
    enigma.createTaskRecord('0x1111111111', 333);
  });
});
