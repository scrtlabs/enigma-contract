let utils = require ("ethereumjs-util");
const hashMessage = (message) => {
    const messageHex = Buffer.from (utils.sha3 (message).toString ('hex'), 'hex');
    const prefix = utils.toBuffer ('\u0019Ethereum Signed Message:\n' + messageHex.length.toString ());
    return utils.bufferToHex (utils.sha3 (Buffer.concat ([prefix, messageHex])));
};

// signs message using web3 (auto-applies prefix)
const signMessage = (signer, message = '', options = {}) => {
    return web3.eth.sign (signer, web3.sha3 (message, options));
};

// signs hex string using web3 (auto-applies prefix)
const signHex = (signer, message = '') => {
    return signMessage (signer, message, { encoding: 'hex' });
};

const URL = 'localhost:3001';
const PKEY = 'AAAAB3NzaC1yc2EAAAADAQABAAABAQC4ReB9wai5xcNnlYpFWfMv+Dwz1wC6vac0HRQ099/mthViVImDzIWUEVqQitWbWpGR7y8bNw+j/OZDbOWQy0Rl8kfYbjgpVOEREal87hxCFKF4D47NODH145Q9M9Jd2UqiK6GVeQHh4a4mEXWb6padpi1FwFPkHVNwDNDn/o1rbhJeARfHuFUHLUiR+jnJEWnHlsVyXWe5Wih8UiY6pmyKgLCc1wfMnRpGlSWKSQrYcdVSHSM6+lGirUUOOAlq0g8PcboKEoPWlpPycf7TEB3jYF0W6rmwxlf4gOr3da+b4lRoZZlXpiBxAeWqkez2+gZQlHaa+O2Dqk093AZGSMQz';
const SECRET_CONTRACT = '0x98d9f9e8debd4a632682ba207670d2a5acd3c489';
const QUOTE = 'AgAAAMoKAAAGAAUAAAAAABYB+Vw5ueowf+qruQGtw+6ELd5kX5SiKFr7LkiVsXcAAgL/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAHAAAAAAAAAFC0Z2msSprkA6a+b16ijMOxEQd1Q3fiq2SpixYLTEv9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACD1xnnferKFHD2uvYqTXdDA8iZ22kCD5xw7h38CMfOngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqAIAAA==';

let Enigma = artifacts.require ("./Enigma.sol");
contract ('Enigma', function (accounts) {

    it ("...registering new worker", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.register (URL, PKEY, { from: accounts[0] });
        }).then (function (result) {
            event = result.logs[0];
            console.log (event);
            assert.equal (event.args._success, true, "Worker registration failed.");
        });
    });

    it ("...login worker", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.login (QUOTE, { from: accounts[0] });
        }).then (function (result) {
            event = result.logs[0];
            console.log (event);
            assert.equal (event.args._success, true, "Login failed.");

            worker = event.args.user;
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

            let args = ['uint dealId', '0', 'address[] destAddresses', 'test', 'test2'];
            let preprocessor = ['shuffle(destAddresses)'];
            return enigma.compute (SECRET_CONTRACT,
                'mixAddresses', args, 'distribute', preprocessor,
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

    let msg;
    it ("...solving task", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            const results = [
                'mixAddresses',
                'address[] destAddresses', 'test', 'test2',
                'address[] destAddresses', 'test', 'test2'
            ];
            msg = results.join ('');
            console.log ('the message string', msg);
            const signature = signMessage (accounts[0], msg);
            // const hash = hashMessage ('Test');
            return enigma.solveTask (SECRET_CONTRACT, 0, results, signature, { from: accounts[0] });
        }).then (function (result) {
            let event1 = result.logs[0];
            let event2 = result.logs[1];
            console.log ('solved task event', event1);

            assert.equal (event1.args._success, true, "Unable to verify hash.");
            assert.equal (event2.args._success, true, "Unable to solve task.");
        });
    });
});
