var CoinMixer = artifacts.require ("CoinMixer.sol");
var Enigma = artifacts.require ("Enigma.sol");
var EnigmaLib = artifacts.require ("EnigmaLib.sol");

module.exports = function (deployer) {
    deployer.deploy (Enigma);
    deployer.deploy (CoinMixer);
    deployer.deploy (EnigmaLib);
};
