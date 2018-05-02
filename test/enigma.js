const web3Utils = require ('web3-utils');
const RLP = require ('rlp');

const URL = 'localhost:3001';
const PKEY = 'AAAAB3NzaC1yc2EAAAADAQABAAABAQC4ReB9wai5xcNnlYpFWfMv+Dwz1wC6vac0HRQ099/mthViVImDzIWUEVqQitWbWpGR7y8bNw+j/OZDbOWQy0Rl8kfYbjgpVOEREal87hxCFKF4D47NODH145Q9M9Jd2UqiK6GVeQHh4a4mEXWb6padpi1FwFPkHVNwDNDn/o1rbhJeARfHuFUHLUiR+jnJEWnHlsVyXWe5Wih8UiY6pmyKgLCc1wfMnRpGlSWKSQrYcdVSHSM6+lGirUUOOAlq0g8PcboKEoPWlpPycf7TEB3jYF0W6rmwxlf4gOr3da+b4lRoZZlXpiBxAeWqkez2+gZQlHaa+O2Dqk093AZGSMQz';
const SECRET_CONTRACT = '0x2467636bea0f3c2441227eedbffac59f11d54a80';
const QUOTE = 'AgAAAMoKAAAGAAUAAAAAABYB+Vw5ueowf+qruQGtw+6ELd5kX5SiKFr7LkiVsXcAAgL/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAHAAAAAAAAAFC0Z2msSprkA6a+b16ijMOxEQd1Q3fiq2SpixYLTEv9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACD1xnnferKFHD2uvYqTXdDA8iZ22kCD5xw7h38CMfOngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqAIAAA==';

console.log('web3 version', web3)
let Enigma = artifacts.require ("./contracts/Enigma.sol");
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

    it ("...executing computation", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            let args = ['uint dealId', 'abc', 'address[] destAddresses', '01dd68b96c0a3704f006e419425aca9bcddc5704e3595c29750014733bf756e966debc595a44fa6f83a40e62292c1bbaf610a7935e8a04b3370d64728737dca24dce8f20d995239d86af034ccf3261f97b8137b972', '01dd68b96c0a3704f006e419425aca9bcddc5704e3595c29750014733bf756e966debc595a44fa6f83a40e62292c1bbaf610a7935e8a04b3370d64728737dca24dce8f20d995239d86af034ccf3261f97b8137b972'];
            let encoded = "0x" + RLP.encode (args).toString ("hex");
            console.log ('the rlp encoded string', encoded);

            let preprocessor = ['shuffle(destAddresses)'];
            return enigma.compute (SECRET_CONTRACT,
                'mixAddresses', encoded, 'distribute', preprocessor,
                { from: accounts[0], value: 1 });
        }).then (function (result) {
            let event = result.logs[0];
            console.log ('secret call event', event);

            assert.equal (event.args._success, true, "Unable to compute.");
        });
    });

    it ("...querying task", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.tasks.call (SECRET_CONTRACT, 0, { from: accounts[0] });
        }).then (function (result) {
            console.log ('tasks details', result);
            assert (result.length > 0, "No task found.");
        });
    });

    // let msg;
    // it ("...solving task", function () {
    //     return Enigma.deployed ().then (function (instance) {
    //         enigma = instance;
    //
    //         const parts = [
    //             'mixAddresses',
    //             'uint dealId', 'abc',
    //             'address[] destAddresses', 'test', 'test2',
    //             'uint dealId', 'abc',
    //             'address[] destAddresses', 'test', 'test2'
    //         ];
    //         msg = parts.join ('');
    //         const bytecode = web3.eth.getCode (SECRET_CONTRACT);
    //         console.log ('the message string', msg);
    //
    //         const hash = web3Utils.soliditySha3 (msg, bytecode);
    //         console.log ('the message hash', hash);
    //
    //         const signature = web3.eth.sign (accounts[0], hash);
    //         // const hash = hashMessage ('Test');
    //         const results = [
    //             'uint dealId', 'abc',
    //             'address[] destAddresses', 'test', 'test2',
    //         ];
    //         return enigma.solveTask (SECRET_CONTRACT, 0, results, signature, { from: accounts[0] });
    //     }).then (function (result) {
    //         let event1 = result.logs[0];
    //         let event2 = result.logs[1];
    //         console.log ('solved task event', event1);
    //         event1.args.parts.forEach ((part) => {
    //             console.log ('the part', web3.toAscii (part));
    //         });
    //
    //         assert.equal (event1.args._success, true, "Unable to verify hash.");
    //         assert.equal (event2.args._success, true, "Unable to solve task.");
    //     });
    // });
});
