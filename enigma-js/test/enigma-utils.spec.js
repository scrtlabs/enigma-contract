import chai from 'chai';
import utils from '../src/enigma-utils'
import forge from 'node-forge';

forge.options.usePureJavaScript = true;


describe('enigma-utils', () => {
  it('test enigma-utils', () => {
    expect(utils.test()).toEqual('hello2');
  });

  it('should successfully encrypt the same as in rust', () => {
    const key = '2987699a6d3a5ebd07f4caf422fad2809dcce942cd9db266ed8e2be02cf95ee9'; // SHA256('EnigmaMPC')
    const iv = forge.util.hexToBytes('000102030405060708090a0b');
    const msg = 'This Is Enigma';
    const encrypted = utils.encryptMessage(key, msg, iv);

    expect(encrypted).toEqual(
      '02dc75395859faa78a598e11945c7165db9a16d16ada1b026c9434b134ae000102030405060708090a0b',
    );
  });

  it('should generate a taskId', () => {
    const fn = 'medianWealth(int32,int32)';
    const args = [200000, 300000];
    const scAddr = '0x9d075ae44d859191c121d7522da0cc3b104b8837';
    const blockNumber = 1000;
    const userPubKey = '04f542371d69af8ebe7c8a00bdc5a9d9f39969406d6c1396037' +
      'ede55515845dda69e42145834e631628c628812d85c805e9da1c56415b32cf99d5ae900f1c1565c';

    const taskId = utils.generateTaskId(fn, args, scAddr, blockNumber, userPubKey);
    expect(taskId).toBeTruthy();
  });
});
