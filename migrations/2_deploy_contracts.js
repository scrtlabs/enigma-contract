var EnigmaToken = artifacts.require ("EnigmaToken.sol");
var Enigma = artifacts.require ("Enigma.sol");
var CoinMixer = artifacts.require ("CoinMixer.sol");
var EnigmaP = artifacts.require ("EnigmaP.sol");

module.exports = function (deployer) {
    return deployer
        .then (() => {
            return deployer.deploy (EnigmaToken);
        })
        .then (() => {
            return deployer.deploy (Enigma, EnigmaToken.address, 10);
        })
        .then (() => {
            deployer.deploy (EnigmaP);
            return deployer.deploy (CoinMixer, Enigma.address);
        });

};
