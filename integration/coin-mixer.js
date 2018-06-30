const testUtils = require ('../test/test-utils');
const web3Utils = require ('web3-utils');
const engUtils = require ('../lib/enigma-utils');
const eng = require ('../lib/Enigma');
const EthCrypto = require ('eth-crypto');
const data = require ('../test/data');


// Add the web3 node module
const Web3 = require ('web3');
const contract = require ('truffle-contract');
const EnigmaContract = require ('../build/contracts/Enigma.json');
const EnigmaTokenContract = require ('../build/contracts/EnigmaToken.json');
const CoinMixerContract = require ('../build/contracts/CoinMixer.json');

const Enigma = contract (EnigmaContract);
Enigma.setNetwork (1);

const EnigmaToken = contract (EnigmaTokenContract);
const CoinMixer = contract (CoinMixerContract);

const url = process.env.GANACHE_URL || 'http://localhost:8545';
const provider = new Web3.providers.HttpProvider (url);
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

// This worker impersonates the Principal node and registers if --with-register is specified
const principal = data.principal;
const worker = data.worker;

// Function of the CoinMixer contract
// TODO: encrypt the arguments in this test
const callable = data.callable;
const callback = data.callback;
const encryptedAddresses = [
    '66cc28084054bbe4f805de4ec95ca5d77af2905a779d9f9df7219b544cd7f23084a249bad006a4e84dc0a95880a3b057403ba3bee35c22d3b1b4000102030405060708090a0b',
    '66cc2d2e4952b0bff607a344ce0aa7a506fd970b779d9ee9fe2eee543983f632f7d34bb5d602f1ba6dc0b696564db7bc98262bb5dbeeabbd100a000102030405060708090a0b'
];

let enigma;
let Register;
let enigmaContract;
let tokenContract;
let coinMixerContract;
let principalCustodian;
let coinMixerAccounts;

function handleRegister (err, event) {
    console.log ('got Register event', JSON.stringify (event.args));
    if (web3Utils.toChecksumAddress (event.args.custodian) === principalCustodian) {
        return false;
    }

    const seed = Math.floor (Math.random () * 100000);
    const hash = web3Utils.soliditySha3 ({ t: 'uint256', v: seed });

    let task;
    let dealId;
    const depositAmount = web3Utils.toWei ('1', 'ether');
    const sig = engUtils.sign (principal[4], hash);
    const signer = EthCrypto.recoverPublicKey (sig, hash);
    if (engUtils.toAddress (signer) !== principal[0]) throw 'invalid principal signature';

    console.log ('updating workers parameters with seed', seed);
    enigmaContract.setWorkersParams (seed, sig, {
        from: principalCustodian,
        gas: 4712388,
        gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
    })
        .then (result => {
            gasTracker.logGasUsed (result, 'setWorkersParams');

            console.log ('creating coin mixing deal');
            return coinMixerContract.newDeal ('test', depositAmount, 2, {
                from: web3.eth.defaultAccount,
                gas: 4712388,
                gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
            });
        })
        .then (result => {
            gasTracker.logGasUsed (result, 'newDeal');

            const event = result.logs[0];
            if (!event.args._success) {
                throw 'Unable to create coin mixing deal';
            }
            dealId = event.args._dealId.toNumber ();
            console.log ('created deal', dealId, 'with', 2, 'participants depositing',
                web3Utils.fromWei (depositAmount, 'ether'), 'ETH');

            let promises = [];
            for (let i = 0; i <= 1; i++) {
                console.log ('participant', coinMixerAccounts[i], 'making deposit');
                promises.push (coinMixerContract.makeDeposit (dealId, encryptedAddresses[i], {
                    from: coinMixerAccounts[i],
                    value: depositAmount,
                    gas: 4712388,
                    gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
                }));
                console.log ('deposit stored with destination address:', coinMixerAccounts[i]);
            }
            return Promise.all (promises);
        })
        .then (results => {
            gasTracker.logGasUsed (results[0], 'makeDeposit');

            for (let i = 0; i <= 1; i++) {
                const event = results[i].logs[0];
                if (!event.args._success) {
                    throw 'Unable to make deposit ' + coinMixerAccounts[i];
                }
            }

            console.log ('closed deal', dealId);
            return coinMixerContract.executeDeal (dealId, {
                from: web3.eth.defaultAccount,
                gas: 4712388,
                gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
            });
        })
        .then (result => {
            gasTracker.logGasUsed (result, 'executeDeal');

            const event = result.logs[0];
            if (!event.args._success) {
                throw 'Unable to execute coin mixing deal';
            }
            console.log ('deal closed, sending encrypted addresses to Enigma');
            return web3.eth.getBlockNumber ();
        })
        .then (blockNumber => {
            return enigma.createTask (blockNumber,
                coinMixerContract.address,
                callable,
                [dealId, encryptedAddresses],
                callback,
                1,
                [eng.Preprocessor.RAND]
            );
        })
        .then (_task => {
            task = _task;
            return task.approveFee ({ from: web3.eth.defaultAccount });
        })
        .then (result => {
            // TODO: improve the worker representation in the Task object
            console.log ('giving out task:', task.taskId, 'to signer', task._worker[0]);
            return task.compute ({
                from: web3.eth.defaultAccount,
                gas: 4712388,
                gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
            });
        })
        .then (result => {
            console.log ('got tx:', result.tx, 'for task:', task.taskId, '');
            console.log ('mined on block:', result.receipt.blockNumber);
            gasTracker.logGasUsed (result, 'compute');
        })
        .then (() => {
            gasTracker.displayStats ();
            setTimeout (() => {
                console.log ('waiting for the next worker to register...');
            }, 300);
        })
        .catch (err => {
            console.error (err);
            Register.stopWatching ();
        })
}

web3.eth.getAccounts ()
    .then (accounts => {
        web3.eth.defaultAccount = accounts[0];
        principalCustodian = accounts[9];

        coinMixerAccounts = [];
        for (let i = 1; i <= 6; i++) {
            coinMixerAccounts.push (accounts[i]);
        }

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
        Register = enigmaContract.Register ({ fromBlock: 0 });
        Register.watch (handleRegister);
        console.log ('waiting for Register events...');

        console.log ('registering principal', principal[0]);
        const report = engUtils.encodeReport (
            principal[1],
            principal[2],
            principal[3],
        );
        // Using the same artificial data for all workers
        return enigmaContract.register (
            principal[0], report, {
                from: principalCustodian,
                gas: 4712388,
                gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
            }
        );
    })
    .then (result => {
        const event = result.logs[0];
        if (!event.args._success) {
            throw 'Unable to register the principal node';
        }

        const registers = process.argv[2];
        if (registers === '--with-register') {
            console.log ('registering worker', worker[0]);
            const report = engUtils.encodeReport (
                worker[1],
                worker[2],
                worker[3],
            );
            // Using the same artificial data for all workers
            enigmaContract.register (
                worker[0], report, {
                    from: web3.eth.defaultAccount,
                    gas: 4712388,
                    gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
                }
            );
        }
    })
    .catch (err => {
        console.error (err);
    });
