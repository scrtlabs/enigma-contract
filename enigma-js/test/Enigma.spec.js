import chai from 'chai';
import {Enigma} from '../lib/enigma-js';
import forge from 'node-forge';
import Web3 from 'web3';

forge.options.usePureJavaScript = true;
chai.expect();

const expect = chai.expect;

describe('Enigma tests', () => {
  it('initializes', () => {
    const provider = new Web3.providers.HttpProvider('http://localhost:8545');
    const enigma = new Enigma(provider);
  });

});
