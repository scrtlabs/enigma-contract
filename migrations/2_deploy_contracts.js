var Enigma = artifacts.require ("Enigma.sol");
var CoinMixer = artifacts.require ("CoinMixer.sol");
var EnigmaP = artifacts.require ("EnigmaP.sol");

module.exports = function (deployer) {
    deployer.deploy (Enigma);
    deployer.deploy (EnigmaP);
    deployer.deploy (CoinMixer);
};
