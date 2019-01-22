import chai from 'chai';
import utils from '../src/enigma-utils';
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

  it('should generate a task input hash', () => {
    const encryptedFn = 'de9bc270f30e03de84aca5ea78f18321f50ca886ff522a49d525bc24f6d56cfb2dcb0b1d33b8756196de2' +
      '89626a442e3dffff97312';
    const encryptedAbiEncodedArgs = 'c53b8caeb99cbc78e322945d8fdcc25ed2b0a7c4319a09a63e43e63e860de572ce656b3f0' +
      '3d9ef7763b7b97ecb8e64a625ecbd307a5a41752c0ab2f769dd0054c9dec67373a76b9a26176760c9a819e6d827a4ec052a0ba1' +
      'd6afc4378c1f4111eb91d059fab824edaf198984277df767ec0db016593c73e40804fc2f92c70dda753ad1d55fbd6b4dfde0bce' +
      '44b9c8be4724a7cf16eb437462bb45482f175';
    const scAddrOrPreCodeHash = '0x300c3473734f4fe56d4acb834359a70d47ff2511c4839524c6f078cb28151ff4';
    const userPubKey = '2ea8e4cefb78efd0725ed12b23b05079a0a433cc8a656f212accf58672fee44a20cfcaa50466237273e762' +
      'e49ec912be61358d5e90bff56a53a0ed42abfe27e3';
    const taskInputsHash = utils.generateTaskInputsHash(encryptedFn, encryptedAbiEncodedArgs, scAddrOrPreCodeHash,
      userPubKey);
    expect(taskInputsHash).toEqual('0x2300c9a68af32dde19c22fd12d9ef6a8dda5e4c03547425d3fe5a5eee8ea9811');
  });
});
