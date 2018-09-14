const EnigmaToken = artifacts.require('EnigmaToken.sol');
const Enigma = artifacts.require('Enigma.sol');
const data = require('../test/data');

module.exports = function(deployer) {
  return deployer.then(() => {
    return deployer.deploy(EnigmaToken);
  }).then(() => {
    const principal = data.principal[0];
    console.log('using account', principal, 'as principal signer');
    return deployer.deploy(Enigma, EnigmaToken.address, principal);
  });
};
