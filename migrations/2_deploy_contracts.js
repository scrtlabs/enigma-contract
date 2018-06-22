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
            // Setting the principal node to the first signer address in the data file
            return deployer.deploy (Enigma, EnigmaToken.address, data.worker[0]);
        })
        .then (() => {
            deployer.deploy (EnigmaP);
            return deployer.deploy (CoinMixer, Enigma.address);
        });

};
