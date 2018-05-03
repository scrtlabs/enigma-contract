const web3Utils = require ('web3-utils');
const RLP = require ('rlp');
const lightwallet = require ('eth-signer');
var abi = require ('ethereumjs-abi');

const URL = 'localhost:3001';
const PKEY = 'AAAAB3NzaC1yc2EAAAADAQABAAABAQC4ReB9wai5xcNnlYpFWfMv+Dwz1wC6vac0HRQ099/mthViVImDzIWUEVqQitWbWpGR7y8bNw+j/OZDbOWQy0Rl8kfYbjgpVOEREal87hxCFKF4D47NODH145Q9M9Jd2UqiK6GVeQHh4a4mEXWb6padpi1FwFPkHVNwDNDn/o1rbhJeARfHuFUHLUiR+jnJEWnHlsVyXWe5Wih8UiY6pmyKgLCc1wfMnRpGlSWKSQrYcdVSHSM6+lGirUUOOAlq0g8PcboKEoPWlpPycf7TEB3jYF0W6rmwxlf4gOr3da+b4lRoZZlXpiBxAeWqkez2+gZQlHaa+O2Dqk093AZGSMQz';
const QUOTE = 'AgAAAMoKAAAGAAUAAAAAABYB+Vw5ueowf+qruQGtw+6ELd5kX5SiKFr7LkiVsXcAAgL/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAHAAAAAAAAAFC0Z2msSprkA6a+b16ijMOxEQd1Q3fiq2SpixYLTEv9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACD1xnnferKFHD2uvYqTXdDA8iZ22kCD5xw7h38CMfOngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqAIAAA==';

console.log ('web3 version', web3);
let Enigma = artifacts.require ("./contracts/Enigma.sol");
let CoinMixer = artifacts.require ("./contracts/CoinMixer.sol");
contract ('Enigma', function (accounts) {

    it ("...registering new worker", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.register (URL, PKEY, QUOTE, { from: accounts[0] });
        }).then (function (result) {
            event = result.logs[0];
            console.log (event);
            assert.equal (event.args._success, true, "Worker registration failed.");
        });
    });

    it ("...my worker details", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.workers.call (accounts[0], { from: accounts[0] });
        }).then (function (result) {
            console.log ('my worker details', result);
            assert (result.length > 0, "No worker details.");
        });
    });

    const callable = 'mixAddresses(uint,address[],uint)';
    const callback = 'distribute(uint,address[])';
    const args = [
        'abc', [
            '01dd68b96c0a3704f006e419425aca9bcddc5704e3595c29750014733bf756e966debc595a44fa6f83a40e62292c1bbaf610a7935e8a04b3370d64728737dca24dce8f20d995239d86af034ccf3261f97b8137b972',
            '01dd68b96c0a3704f006e419425aca9bcddc5704e3595c29750014733bf756e966debc595a44fa6f83a40e62292c1bbaf610a7935e8a04b3370d64728737dca24dce8f20d995239d86af034ccf3261f97b8137b972'
        ]
    ];
    it ("...executing computation", function () {
        return Enigma.deployed ()
            .then (function (instance) {
                enigma = instance;
                return CoinMixer.deployed ();
            })
            .then (function (instance) {
                coinMixer = instance;

                const encoded = "0x" + RLP.encode (args).toString ("hex");
                console.log ('the rlp encoded string', encoded);

                let preprocessor = ['rand()'];
                return enigma.compute (
                    coinMixer.address, callable, encoded, callback, preprocessor,
                    { from: accounts[0], value: 1 }
                );
            }).then (function (result) {
                let event = result.logs[0];
                console.log ('secret call event', event);

                assert.equal (event.args._success, true, "Unable to compute.");
            });
    });

    it ("...querying task", function () {
        return Enigma.deployed ()
            .then (function (instance) {
                enigma = instance;
                return CoinMixer.deployed ();
            })
            .then (function (instance) {
                coinMixer = instance;
                return enigma.tasks.call (coinMixer.address, 0, { from: accounts[0] });
            }).then (function (result) {
                console.log ('tasks details', result);
                assert (result.length > 0, "No task found.");
            });
    });

    it ("...testing simple abi encoding", () => {
        // Following the first example documented here: https://solidity.readthedocs.io/en/develop/abi-spec.html
        const functionDef = 'baz(uint32,bool)';
        const rx = /baz\((.*)\)/g;
        const args = rx.exec (functionDef)[1].split (',');
        const functionId = web3Utils.soliditySha3 (functionDef).slice (0, 10);
        const arg1 = abi.rawEncode ([args[0]], [69]).toString ("hex");
        const arg2 = abi.rawEncode ([args[1]], [true]).toString ("hex");
        const hash = functionId + arg1 + arg2;

        console.log ('the function id', functionId, arg1, arg2);

        assert.equal (hash, '0xcdcd77c000000000000000000000000000000000000000000000000000000000000000450000000000000000000000000000000000000000000000000000000000000001');
    });

    it ("...testing dynamic encoding", () => {
        // Following the last example documented here: https://solidity.readthedocs.io/en/develop/abi-spec.html
        const functionDef = 'f(uint256,uint32[],bytes10,bytes)';
        const rx = /f\((.*)\)/g;
        const resultArgs = rx.exec (functionDef)[1].split (',');
        console.log ('the args', resultArgs);
        const functionId = web3Utils.soliditySha3 (functionDef).slice (0, 10);
        const encoded = abi.rawEncode ([resultArgs[0], resultArgs[1], resultArgs[2], resultArgs[3]], [0x123, [0x456, 0x789], "1234567890", "Hello, world!"]).toString ("hex");

        const hash = functionId + encoded;

        console.log ('dynamic encoding parts', functionId, encoded);

        assert.equal (hash, '0x8be65246' +
            '0000000000000000000000000000000000000000000000000000000000000123' +
            '0000000000000000000000000000000000000000000000000000000000000080' +
            '3132333435363738393000000000000000000000000000000000000000000000' +
            '00000000000000000000000000000000000000000000000000000000000000e0' +
            '0000000000000000000000000000000000000000000000000000000000000002' +
            '0000000000000000000000000000000000000000000000000000000000000456' +
            '0000000000000000000000000000000000000000000000000000000000000789' +
            '000000000000000000000000000000000000000000000000000000000000000d' +
            '48656c6c6f2c20776f726c642100000000000000000000000000000000000000');
    });
    // Changing a character in one of the two results should break the validation
    const localResults = [
        'abc', [
            '0x2467636bea0f3c2441227eedbffac59f11d54a80',
            '0x8e4c131b37383e431b9cd0635d3cf9f3f628edae'
        ]
    ];
    const contractResults = [
        'abc', [
            '0x2467636bea0f3c2441227eedbffac59f11d54a80',
            '0x8e4c131b37383e431b9cd0635d3cf9f3f628edae'
        ]
    ];
    it ("...solving task", function () {
        return Enigma.deployed ()
            .then (function (instance) {
                enigma = instance;

                return CoinMixer.deployed ();
            })
            .then (function (instance) {
                coinMixer = instance;

                const encodedArgs = "0x" + RLP.encode (args).toString ("hex");

                const fName = callback.substr (0, callback.indexOf ('('));
                console.log ('the function name', fName);
                const rx = /distribute\((.*)\)/g;
                const resultArgs = rx.exec (callback)[1].split (',');
                console.log ('the args', resultArgs);
                const functionId = web3Utils.soliditySha3 (callback).slice (0, 10);
                const localData = functionId + abi.rawEncode (resultArgs, localResults).toString ("hex");
                console.log ('the encoded data', localData);

                const bytecode = web3.eth.getCode (coinMixer.address);
                console.log ('the bytecode', bytecode);

                // The holy grail, behaves exactly as keccak256() in Solidity
                const hash = web3Utils.soliditySha3 (encodedArgs, localData, bytecode);
                console.log ('the message hash', hash);
                const signature = web3.eth.sign (accounts[0], hash);

                const contractData = functionId + abi.rawEncode (resultArgs, contractResults).toString ("hex");
                return enigma.commitResults (coinMixer.address, 0, contractData, signature, { from: accounts[0] });
            }).then (function (result) {
                let event1 = result.logs[0];
                let event2 = result.logs[1];
                console.log ('solved task event', event1);

                assert.equal (event1.args._success, true, "Unable to verify hash.");
                assert.equal (event2.args._success, true, "Unable to solve task.");
            });
    });
});
