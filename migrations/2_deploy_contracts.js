const EnigmaToken = artifacts.require('EnigmaToken.sol');
const Enigma = artifacts.require('Enigma.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol')

module.exports = function(deployer) {
  return deployer.then(() => {
    return deployer.deploy(EnigmaToken);
  }).then(() => {
    return deployer.deploy(SolRsaVerify);
  })
  .then(() => {
    deployer.link(SolRsaVerify, Enigma);
    const principal = '0xc44205c3aFf78e99049AfeAE4733a3481575CD26';
    console.log('using account', principal, 'as principal signer');
    return deployer.deploy(Enigma, EnigmaToken.address, principal);
  });
};
