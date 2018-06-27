const testUtils = require ('./test-utils');

const EnigmaContract = artifacts.require ("./contracts/Enigma.sol");
const EnigmaToken = artifacts.require ("./contracts/EnigmaToken.sol");
const CoinMixer = artifacts.require ("./contracts/CoinMixer.sol");

let gasTracker = new testUtils.GasTracker();


// Initialize contract variables
let enigmaContract;
let tokenContract;
let coinMixerContract;
contract ('Enigma Integration', accounts => {
    it.skip ("...should set workers params", () => {
        return EnigmaContract.deployed ()
            .then (instance => {
                enigmaContract = instance;

                const seed = Math.floor (Math.random () * 100000);
                const hash = web3Utils.soliditySha3 (
                    { t: 'uint256', v: seed }
                );
                const sig = engUtils.sign (data.worker[4], hash);
                return enigmaContract.setWorkersParams (seed, sig,
                    {
                        from: accounts[0],
                        gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
                    }
                );
            }).then (results => {
                let event = result.logs[0];
                assert.equal (event.args._success, true, 'Unable to parameterize workers.');
                gasTracker.logGasUsed (results[0], 'setWorkersParams');
            });
    });
});
