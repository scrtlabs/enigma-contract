/* eslint-disable prefer-spread,prefer-rest-params */
import Web3 from 'web3';
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
import contract from 'truffle-contract';

/**
 * Class encapsulation the Enigma operations.
 */
export default class Enigma {
  /**
   * The Enigma constructor
   *
   * @param {Web3.Provider} web3Provider
   * @param {Object} txDefaults
   */
  constructor(web3Provider, txDefaults = {}) {
    this.web3 = new Web3(web3Provider);
    this.txDefaults = txDefaults;
    this.createContracts(web3Provider);
  }

  /**
   * Creating the Enigma contracts.
   *
   * @param {Web3.Provider} provider
   */
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
