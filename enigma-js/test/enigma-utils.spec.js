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
    const encryptedFn = '8bdd418475e41bf245c07a840262cbef265ab8da8b75b2f41b7652960479d10f579f9641fe17da43cccf';
    const encryptedAbiEncodedArgs = '0ea72be1476aa0e050be0af46de6d948c05e4eadafa567feed3ccbb2197d4b1002e585b09' +
      'ef29c8b7e9ceeb97a317bb17ee047ed1891ac4cc05600c79cee6840e923778c6b37a5ae0a28c78138dd104879dc948c25e8e5c1' +
      '290ac337f65e357883bf68aa63c4b38d105652e7d598621430394f2cabc227000de65d01c012a7cb64c391401995a8e83adc337' +
      'e9d949f61752c995ce8d5bc4a40925f10bfadaf7b6ea1dd0859818c0fabc3da6f7b923b427688122d67daca575f3361a6fc61c9' +
      'f8f46195645b576f04211a835cf55bba580e005fb7a36bd9ef665de7944f5ab9ad1f76e44bb54ad76d107a93649a51d8fb2a576' +
      '3ba53c8bea4e51a2385ce4aed633d5a3890662cb40118e73e03bee4a393b6c4b18040bcb010aa303bd8d7a2';
    const scAddrOrPreCodeHash = '0xd8bba960831bacafe85a45f6e29d3d3cb7f61180cce79dc41d47ab6a18e195dc';
    const taskInputsHash = utils.generateTaskInputsHash(encryptedFn, encryptedAbiEncodedArgs, scAddrOrPreCodeHash);
    expect(taskInputsHash).toEqual('0x0dfae176ba41eba5055b9f0cf5bccf15d1da6db024f5ea457b22f34dfb6a5f9f');
  });
});
