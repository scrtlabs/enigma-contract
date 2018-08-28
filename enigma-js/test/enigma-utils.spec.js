import chai from 'chai';
import {utils} from '../lib/enigma-js';
import forge from 'node-forge';

forge.options.usePureJavaScript = true;
chai.expect();

const expect = chai.expect;

describe('enigma-utils', () => {
  it('test enigma-utils', () => {
    expect(utils.test()).to.be.equal('hello2');
  });

  it('should successfully encrypt the same as in rust', () => {
    const key = '2987699a6d3a5ebd07f4caf422fad2809dcce942cd9db266ed8e2be02cf95ee9'; // SHA256('EnigmaMPC')
    const iv = forge.util.hexToBytes('000102030405060708090a0b');
    const msg = 'This Is Enigma';
    const encrypted = utils.encryptMessage(key, msg, iv);

    expect(encrypted).to.be.equal('02dc75395859faa78a598e11945c7165db9a16d16ada1b026c9434b134ae000102030405060708090a0b');
  });
});
