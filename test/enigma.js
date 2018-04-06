var Enigma = artifacts.require ("./Enigma.sol");
contract ('Enigma', function (accounts) {

    it ("...registering new contract", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.registerContract ('0x98d9f9e8debd4a632682ba207670d2a5acd3c489', 'CoinMixer', { from: accounts[0] });
        }).then (function (result) {
            event = result.logs[0];
            console.log (event);
            assert.equal (event.args._success, true, "Contract registration failed.");
        });
    });

    it ("...registering new worker", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.registerWorker (
                '0x98d9f9e8debd4a632682ba207670d2a5acd3c489',
                'AAAAB3NzaC1yc2EAAAADAQABAAABAQC4ReB9wai5xcNnlYpFWfMv+Dwz1wC6vac0HRQ099/mthViVImDzIWUEVqQitWbWpGR7y8bNw+j/OZDbOWQy0Rl8kfYbjgpVOEREal87hxCFKF4D47NODH145Q9M9Jd2UqiK6GVeQHh4a4mEXWb6padpi1FwFPkHVNwDNDn/o1rbhJeARfHuFUHLUiR+jnJEWnHlsVyXWe5Wih8UiY6pmyKgLCc1wfMnRpGlSWKSQrYcdVSHSM6+lGirUUOOAlq0g8PcboKEoPWlpPycf7TEB3jYF0W6rmwxlf4gOr3da+b4lRoZZlXpiBxAeWqkez2+gZQlHaa+O2Dqk093AZGSMQz',
                'QUOTE',
                '10',
                { from: accounts[0] });
        }).then (function (result) {
            event = result.logs[0];
            console.log (event);
            assert.equal (event.args._success, true, "Contract registration failed.");
        });
    });

    it ("...listing active workers", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.listActiveWorkers.call ({}, { from: accounts[0] });
        }).then (function (result) {
            console.log ('active workers', result);
            assert (result.length > 0, "No active workers.");

            firstWorkerAddress = result[0];
        });
    });

    it ("...getting worker details", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.listActiveWorkers.call ({}, { from: accounts[0] });
        }).then (function (result) {
            console.log ('active workers', result);
            assert (result.length > 0, "No active workers.");

            firstWorkerAddress = result[0];
        });
    });
    it ("...listing active workers", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.listActiveWorkers.call ({}, { from: accounts[0] });
        }).then (function (result) {
            console.log ('active workers', result);
            assert (result.length > 0, "No active workers.");

            firstWorkerAddress = result[0];
        });
    });
});
