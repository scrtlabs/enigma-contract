var CoinMixer = artifacts.require ("./CoinMixer.sol");

contract ('CoinMixer', function (accounts) {

    it ("...creating new deal.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.newDeal ('test', 1, 1, { from: accounts[0] });
        }).then (function (result) {
            let event = result.logs[0];
            console.log (event);
            assert.equal (event.args._success, true, "Deal creation failed.");
        });
    });

    it ("...deal status.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.dealStatus.call (0, { from: accounts[0] });
        }).then (function (deal) {
            console.log ('deal status', deal);
            assert.equal (deal[1], 1, "Deal not found.");
        });
    });

    it ("...making a deposit.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.dealStatus.call (0, { from: accounts[0] });
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

    it ("...querying active deals.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.listDeals.call ({}, { from: accounts[0] });
        }).then (function (deals) {
            let statuses = deals[0];
            let activeDeals = [];
            for (let i = 0; i < statuses.length; i++) {
                if (statuses[i] < 2) {
                    activeDeals.push (i)
                }
            }
            console.log ('active deals', activeDeals);
            assert (activeDeals.length > 0, "Active deals not found.");
        });
    });

    it ("...is participating to deal.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.listDeals.call ({}, { from: accounts[0] });
        }).then (function (deals) {
            console.log ('deal statuses', deals);
            let participates = deals[1];
            let participatingDeals = [];
            for (let i = 0; i < participates.length; i++) {
                if (participates[i] == 1) {
                    participatingDeals.push (i)
                }
            }
            console.log ('participating deals', participatingDeals);
            assert (participatingDeals.length > 0, "Participating deals not found.");
        });
    });

    it ("...retrieving encrypted addresses.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.getEncryptedAddresses.call (0, { from: accounts[0] });
        }).then (function (encryptedAddresses) {
            console.log ('encrypted addresses', encryptedAddresses);
            assert (encryptedAddresses.length > 0, "Encrypted addresses not found.");
        });
    });


    it ("...executing the deal.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.executeDeal (0, {
                from: accounts[0],
                value: 1
            });
        }).then (function (result) {
            const event = result.logs[0];
            console.log ('executed deal', event);
            assert.equal (event.args._success, true, "Deal execution failed.");
        });
    });

    const addresses = ["0x8f0483125fcb9aaaefa9209d8e9d7b9c8b9fb90f", "0x1622c3352f54f66e2b86583958d30db50695ec4c", "0x98d9f9e8debd4a632682ba207670d2a5acd3c489"];
    it ("...mixing addresses.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            const seed = Math.floor (Math.random () * 256);
            return coinMixerInstance.mixAddresses.call (0, addresses, seed, {
                from: accounts[0],
            });
        }).then (function (result) {
            console.log ('the mixed addresses', result);
            assert.equal (result[1].length, addresses.length, "Unable to mix addresses.");
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
