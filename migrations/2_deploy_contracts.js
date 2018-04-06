var CoinMixer = artifacts.require ("CoinMixer.sol");
var Enigma = artifacts.require ("Enigma.sol");

module.exports = function (deployer) {
    deployer.deploy (Enigma);
    deployer.deploy (CoinMixer);
};
