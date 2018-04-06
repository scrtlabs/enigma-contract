var CoinMixer = artifacts.require ("./CoinMixer.sol");

contract ('CoinMixer', function (accounts) {

    it ("...creating new deal.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.newDeal ('test', 1, 1, { from: accounts[0] });
        }).then (function (result) {
            event = result.logs[0];
            console.log (event);
            assert.equal (event.args._success, true, "Deal creation failed.");
        });
    });

    it ("...making a deposit.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.dealStatus (0);
        }).then (function (deal) {
            let numParticipants = deal[1];
            console.log ('the deal: ' + deal);
            for (let i = 0; i < numParticipants; i++) {

                console.log (i);
            }
            return coinMixerInstance.makeDeposit (0, 'test', {
                from: accounts[0],
                value: 1
            });
        }).then (function (result) {
            let event = result.logs[0];
            console.log ('secret call event', result.logs[2]);
            assert.equal (event.args._success, true, "Deposit failed.");
        });
    });

    it ("...listing deal titles.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.listDealTitles.call ();
        }).then (function (result) {
            console.log (result);
            assert.equal (event.args._success, true, "Deal creation failed.");
        });
    });
    it ("...is participating to deal.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.isParticipating.call (0, { from: accounts[0] });
        }).then (function (result) {
            console.log (result);
            assert.equal (event.args._success, true, "Determined participation successfully.");
        });
    });
    // it ("...distributing.", function () {
    //     return CoinMixer.deployed ().then (function (instance) {
    //         coinMixerInstance = instance;
    //
    //         return coinMixerInstance.distribute (0, ['0xf08df3efdd854fede77ed3b2e515090eee765154'], { from: accounts[0] });
    //     }).then (function (result) {
    //         let event = result.logs[0];
    //         console.log ('the result:', JSON.stringify (event));
    //         assert.equal (event.args._success, true, "Distributed successfully.");
    //     });
    // });
});
