let EnigmaLib = artifacts.require ("./EnigmaLib.sol");
contract ('EnigmaLib', function (accounts) {
    it ("...computing.", function () {
        return EnigmaLib.deployed ().then (function (instance) {
            enigmaLibInstance = instance;

            return enigmaLibInstance.compute ('test', ['0xf08df3efdd854fede77ed3b2e515090eee765154'], 'update', 0, {
                from: accounts[0],
                value: 1
            });
        }).then (function (result) {
            let event = result.logs[0];
            console.log ('the result:', JSON.stringify (event));
            assert.equal (event.args._success, true, "Computed successfully.");
        });
    });
});
