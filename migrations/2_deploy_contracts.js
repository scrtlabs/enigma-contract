var CoinMixer = artifacts.require ("CoinMixer.sol");
var Enigma = artifacts.require ("Enigma.sol");
var EnigmaP = artifacts.require ("EnigmaP.sol");

module.exports = function (deployer) {
    deployer.deploy (Enigma);
    deployer.deploy (CoinMixer);
    deployer.deploy (EnigmaP);
};
