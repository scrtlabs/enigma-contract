import chai from 'chai';
import {Enigma} from '../lib/enigma-js';
import forge from 'node-forge';
import Web3 from 'web3';
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';

forge.options.usePureJavaScript = true;
chai.expect();

const expect = chai.expect;

describe('Enigma tests', () => {
  let enigma;
  it('initializes', () => {
    const provider = new Web3.providers.HttpProvider('http://localhost:9545');
    const web3 = new Web3(provider);
    return web3.eth.getAccounts().then((accounts) => {
      console.log('the accounts', accounts);
      enigma = new Enigma(
        web3,
        EnigmaContract.networks['4447'].address,
        EnigmaTokenContract.networks['4447'].address,
        {
          from: accounts[0],
          gasPrice: '10000000000000',
          gas: 1000000,
        },
      );
      expect(enigma.version()).to.be.equal('0.0.1');
    });
  });

  it('create task record', () => {
    enigma.createTaskRecord('0x1111111111', 333);
  });
});
