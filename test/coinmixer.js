var CoinMixer = artifacts.require ("./CoinMixer.sol");

contract ('CoinMixer', function (accounts) {

    it ("...creating new deal.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.newDeal ('test', 1, 2, { from: accounts[0] });
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
            console.log ('deal status', deal, deal[4].toNumber());
            // Validating the number of participants
            assert.equal (deal[1], 2, "Deal not found.");
        });
    });

    const encryptedAddresses = [
        '76625d74e69da291878a6b26594c1bd1b4de574d847c4581417359792618a1b327737d45daf0ca3b900497f65d4339eb644a593289ba8cf68c74',
        '86625d74e69da291878a6b26594c1bd1b4de574d847c4581417359792618a1b327737d45daf0ca3b900497f65d4339eb644a593289ba8cf68c74'
    ];
    it ("...making two deposits.", function () {
        return CoinMixer.deployed ()
            .then (function (instance) {
                coinMixerInstance = instance;

                return coinMixerInstance.dealStatus.call (0, { from: accounts[0] });
            })
            .then (function (deal) {
                assert.equal (deal[1], 2, "Deal must accept exactly 2 participants.");

                return coinMixerInstance.makeDeposit (0, encryptedAddresses[0], {
                    from: accounts[0],
                    value: 1
                });
            })
            .then (function (result) {
                let event = result.logs[0];
                assert.equal (event.args._success, true, "First deposit failed.");
            })
            .then (function () {
                console.log ('the second account', accounts[0], accounts[1]);
                return coinMixerInstance.makeDeposit (0, encryptedAddresses[1], {
                    from: accounts[1],
                    value: 1
                });
            })
            .then (function (result) {
                let event = result.logs[0];
                assert.equal (event.args._success, true, "Second deposit failed.");
            })
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

    function bufToArray (buffer) {
        let array = new Array ();
        for (data of buffer.values ()) array.push (data);
        return array;
    }

    it ("...retrieving encrypted addresses.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            // TODO: not the most efficient way to do this. Try to RLP serialize from Solidity instead.
            return coinMixerInstance.countEncryptedAddresses.call (0, { from: accounts[0] })
        }).then ((count) => {
            let promises = [];
            for (let i = 0; i < count; i++) {
                promises.push (coinMixerInstance.getEncryptedAddress.call (0, i, { from: accounts[0] }));
            }
            return Promise.all (promises);

        }).then (function (encAddresses) {
            let addresses = [];
            for (let i = 0; i < encAddresses.length; i++) {
                addresses.push(web3.toAscii(encAddresses[i]));
            }
            console.log ('the dest addresses', addresses);
            assert (encAddresses.length > 0, "Encrypted addresses not found.");
        });
    });

    it ("...retrieving deal.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.deals.call (0, { from: accounts[0] });
        }).then (function (deal) {
            console.log ('the deal', deal);
            // assert (encryptedAddresses.length > 0, "Encrypted addresses not found.");
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

            const seed = Math.floor (Math.random () * 128);
            return coinMixerInstance.mixAddresses.call (0, addresses, seed, {
                from: accounts[0],
            });
        }).then (function (result) {
            console.log ('the mixed addresses', result);
            assert.equal (result[1].length, addresses.length, "Unable to mix addresses.");
        });
    });

    it ("...distributing.", function () {
        return CoinMixer.deployed ().then (function (instance) {
            coinMixerInstance = instance;

            return coinMixerInstance.distribute (0, [
                '0x6330a553fc93768f612722bb8c2ec78ac90b3bbc',
                '0x5aeda56215b167893e80b4fe645ba6d5bab767de'
            ], { from: accounts[0] });
        }).then (function (result) {
            let event = result.logs[0];
            console.log ('the result:', JSON.stringify (event));
            assert.equal (event.args._success, true, "Distributed successfully.");
        });
    });
});
