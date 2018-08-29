import Web3 from 'web3';
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import contract from 'truffle-contract';

export default class Enigma {
  constructor(web3Provider, txDefaults = {}) {
    this.web3 = new Web3(web3Provider);
    this.txDefaults = txDefaults;
    this.createContracts(web3Provider);
  }

  createContracts(provider) {
    this.Enigma = contract(EnigmaContract);
    this.EnigmaToken = contract(EnigmaTokenContract);

    // Workaround for this issue: https://github.com/trufflesuite/truffle-contract/issues/57
    [this.Enigma, this.EnigmaToken].forEach((instance) => {
      instance.setProvider(provider);
      if (typeof instance.currentProvider.sendAsync !== 'function') {
        instance.currentProvider.sendAsync = function() {
          return instance.currentProvider.send.apply(
            instance.currentProvider, arguments,
          );
        };
      }
    });
  }
}
