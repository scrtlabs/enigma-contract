const EnigmaToken = artifacts.require ("EnigmaToken.sol");
const Enigma = artifacts.require ("Enigma.sol");
const CoinMixer = artifacts.require ("CoinMixer.sol");
const EnigmaP = artifacts.require ("EnigmaP.sol");
const data = require ('../test/data');

module.exports = function (deployer) {
    return deployer
        .then (() => {
            return deployer.deploy (EnigmaToken);
        })
        .then (() => {
            return web3.eth.getAccounts ()
        })
        .then ((accounts) => {
            // Setting the principal node to the first signer address in the data file
            const principal = accounts[0];
            console.log ('using account', principal, 'as principal custodian');
            return deployer.deploy (Enigma, EnigmaToken.address, principal);
        })
        .then (() => {
            deployer.deploy (EnigmaP);
            return deployer.deploy (CoinMixer, Enigma.address);
        });

};
