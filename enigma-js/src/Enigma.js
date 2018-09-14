/* eslint-disable prefer-spread,prefer-rest-params */
import EnigmaContract from '../../build/contracts/Enigma';
import EnigmaTokenContract from '../../build/contracts/EnigmaToken';
// import contract from 'truffle-contract';
//
/**
 * Class encapsulation the Enigma operations.
 */
export default class Enigma {
  /**
   * The Enigma constructor
   *
   * @param {Web3} web3
   * @param {string} enigmaContractAddr
   * @param {string} tokenContractAddr
   * @param {Object} txDefaults
   */
  constructor(web3, enigmaContractAddr, tokenContractAddr, txDefaults = {}) {
    this.web3 = web3;
    this.txDefaults = txDefaults;

    this.createContracts(enigmaContractAddr, tokenContractAddr);
  }

  /**
   * Creating the Enigma contracts.
   *
   * @param {string} enigmaContractAddr
   * @param {string} tokenContractAddr
   */
  createContracts(enigmaContractAddr, tokenContractAddr) {
    this.enigmaContract = new this.web3.eth.Contract(EnigmaContract['abi'],
      enigmaContractAddr, this.txDefaults);
    this.tokenContract = new this.web3.eth.Contract(EnigmaTokenContract['abi'],
      tokenContractAddr, this.txDefaults);
  }

  /**
   * Store a task record on chain
   *
   * @param {string} taskId
   * @param {number} fee
   */
  createTaskRecord(taskId, fee) {
    console.log('creating task record', taskId, fee);
    this.enigmaContract.methods.createTaskRecord(taskId, fee).
      send(this.txDefaults).
      on('transactionHash', function(hash) {
        console.log('got tx hash', hash);
      }).
      on('receipt', function(receipt) {
        console.log('got receipt', receipt);
      }).
      on('confirmation', function(confirmationNumber, receipt) {
        console.log('got confirmation', confirmationNumber, receipt);
      }).
      on('error', console.error);
  }

  /**
   * Return the version number of the library
   *
   * @return {string}
   */
  version() {
    return '0.0.1';
  }
}
