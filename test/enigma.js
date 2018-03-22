var Enigma = artifacts.require ("./Enigma.sol");
contract ('Enigma', function (accounts) {

    it ("...registering new contract", function () {
        return Enigma.deployed ().then (function (instance) {
            enigma = instance;

            return enigma.register ('0xf12b5dd4ead5f743c6baa640b0216200e89b60da', 'CoinMixer', { from: accounts[0] });
        }).then (function (result) {
            event = result.logs[0];
            console.log (event);
            assert.equal (event.args._success, true, "Contract registration failed.");
        });
    });
});
