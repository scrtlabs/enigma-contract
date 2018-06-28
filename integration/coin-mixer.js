const testUtils = require ('../test/test-utils');
const web3Utils = require ('web3-utils');
const engUtils = require ('../lib/enigma-utils');
const data = require ('../test/data');
const eng = require ('../lib/Enigma');


// Add the web3 node module
const Web3 = require ('web3');
const contract = require ('truffle-contract');
const EnigmaContract = require ('../build/contracts/Enigma.json');
const EnigmaTokenContract = require ('../build/contracts/EnigmaToken.json');
const CoinMixerContract = require ('../build/contracts/CoinMixer.json');

const Enigma = contract (EnigmaContract);
const EnigmaToken = contract (EnigmaTokenContract);
const CoinMixer = contract (CoinMixerContract);

const provider = new Web3.providers.HttpProvider ('http://127.0.0.1:8545');
const web3 = new Web3 (provider);

const GAS_PRICE_GWEI = '2'; // To estimate current gas price: https://ethgasstation.info/
let gasTracker = new testUtils.GasTracker (web3, GAS_PRICE_GWEI);

// Workaround for this issue: https://github.com/trufflesuite/truffle-contract/issues/57
[Enigma, EnigmaToken, CoinMixer].forEach (instance => {
    instance.setProvider (provider);
    if (typeof instance.currentProvider.sendAsync !== "function") {
        instance.currentProvider.sendAsync = function () {
            return instance.currentProvider.send.apply (
                instance.currentProvider, arguments
            );
        };
    }
});

let enigma;
let enigmaContract;
let tokenContract;
let coinMixerContract;

function handleRegister (err, event) {

    console.log (event); // same results as the optional callback above
    const seed = Math.floor (Math.random () * 100000);
    const hash = web3Utils.soliditySha3 (
        { t: 'uint256', v: seed }
    );

    let task;
    const sig = engUtils.sign (data.worker[4], hash);
    enigmaContract.setWorkersParams (seed, sig, {
        from: web3.eth.defaultAccount,
        gas: 4712388,
        gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
    })
        .then (result => {
            gasTracker.logGasUsed (result, 'setWorkersParams');

            return web3.eth.getBlockNumber ();
        })
        .then (blockNumber => {
            return enigma.createTask (blockNumber,
                coinMixerContract.address,
                data.callable,
                data.args,
                data.callback,
                1,
                [eng.Preprocessor.RAND]
            );
        })
        .then (_task => {
            task = _task;
            return task.approveFee ({ from: web3.eth.defaultAccount });
        })
        .then (result => {
            let event = result.logs[0];

            return task.compute ({
                from: web3.eth.defaultAccount,
                gas: 4712388,
                gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
            });
        })
        .then (result => {
            let event = result.logs[0];
        })
        .then (() => {
            gasTracker.displayStats ();
        })
        .catch (err => {
            console.error (err);
        })
}

web3.eth.getAccounts ()
    .then (accounts => {
        web3.eth.defaultAccount = accounts[0];

        return Enigma.deployed ();
    })
    .then (instance => {
        enigmaContract = instance;

        return EnigmaToken.deployed ();
    })
    .then (instance => {
        tokenContract = instance;
        enigma = new eng.Enigma (enigmaContract, tokenContract);

        return CoinMixer.deployed ();
    })
    .then (instance => {
        coinMixerContract = instance;
        enigmaContract.Register ({ fromBlock: 0 }).watch (handleRegister);


        const report = engUtils.encodeReport (
            data.worker[1],
            data.worker[2],
            data.worker[3],
        );
        // Using the same artificial data for all workers
        enigmaContract.register (
            data.worker[0], report, {
                from: web3.eth.defaultAccount,
                gas: 4712388,
                gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
            }
        );
    })
    .catch (err => {
        console.error (err);
    });
