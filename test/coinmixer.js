var CoinMixer = artifacts.require("./CoinMixer.sol");

contract('CoinMixer', function (accounts) {

    it("...creating new deal.", function () {
        return CoinMixer.deployed().then(function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.newDeal('test', 1, 5, {from: accounts[0]});
        }).then(function (result) {
            event = result.logs[0];
            console.log(event);
            assert.equal(event.args._success, true, "Deal creation failed.");
        });
    });

    it("...making a deposit.", function () {
        return CoinMixer.deployed().then(function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.dealStatus(0);
        }).then(function (deal) {
            let numParticipants = deal[1];
            for (let i = 0; i < numParticipants; i++) {

                console.log(i);
            }
            return coinMixerInstance.makeDeposit(0, 'test', {from: accounts[0], value: 1});
        }).then(function (result) {
            event = result.logs[0];
            console.log(event);
            assert.equal(event.args._success, true, "Deal creation failed.");
        });
    });
});
