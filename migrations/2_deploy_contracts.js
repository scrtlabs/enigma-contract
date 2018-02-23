var CoinMixer = artifacts.require("CoinMixer.sol");

module.exports = function (deployer) {
    deployer.deploy(CoinMixer);
};
