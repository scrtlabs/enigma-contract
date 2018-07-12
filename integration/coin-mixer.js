const testUtils = require ('../test/test-utils');
const web3Utils = require ('web3-utils');
const engUtils = require ('../lib/enigma-utils');
const eng = require ('../lib/Enigma');


// Add the web3 node module
const Web3 = require ('web3');
const contract = require ('truffle-contract');
const EnigmaContract = require ('../build/contracts/Enigma.json');
const EnigmaTokenContract = require ('../build/contracts/EnigmaToken.json');
const CoinMixerContract = require ('../build/contracts/CoinMixer.json');

// Currently, the Enigma library relies on contract objects instantiated with truffle-contract
// TODO: should we stick to truffle-contract or use web3
// Look at the Web3 wrapper of 0x
const Enigma = contract (EnigmaContract);
Enigma.setNetwork (1);
const EnigmaToken = contract (EnigmaTokenContract);
const CoinMixer = contract (CoinMixerContract);

const argv = require ('minimist') (process.argv.slice (2));
const url = argv.url || 'http://localhost:8545';
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


// Function of the CoinMixer contract
const callable = 'mixAddresses(uint32,address[],uint256)';
const callback = 'distribute(uint32,address[])';

let addresses = ['0x4B8D2c72980af7E6a0952F87146d6A225922acD7', '0x1d1B9890D277dE99fa953218D4C02CAC764641d7'];
const encryptedAddresses = get_encryptedAddresses (addresses);

let enigma;
let principal;
let Register;
let enigmaContract;
let tokenContract;
let coinMixerContract;
let coinMixerAccounts;

// Wait for workers to register to the network
// Reparameterize the workers
// Give out a fully executed Coin Mixing deal to the network upon new worker registration
function handleRegister (err, event) {
    // Checks if the register event comes from a worker, not the principal node
    console.log ('got Register event', JSON.stringify (event.args));
    if (web3Utils.toChecksumAddress (event.args.custodian) === principal.custodian) {
        return false;
    }

    // Declaring variables for the Coin Mixing Dapp
    let task;
    let dealId;
    const depositAmount = web3Utils.toWei ('1', 'ether');

    console.log ('creating coin mixing deal');
    // *********************************************
    // Emulating the principal, not part of the Dapp
    principal.setWorkersParams ()
        .then (result => {
            const event = result.logs[0];
            if (!event.args._success) {
                throw 'Unable to set worker params';
            }

            // End of the principal emulation
            // ******************************
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
            // This is where we are calling Enigma
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
            // Out of scope for the dapp
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

let accounts;
web3.eth.getAccounts ()
    .then (_accounts => {
        accounts = _accounts;
        web3.eth.defaultAccount = accounts[0];

        coinMixerAccounts = [];
        for (let i = 1; i <= 6; i++) {
            coinMixerAccounts.push (accounts[i]);
        }

        return Enigma.deployed ();
    })
    .then (instance => {
        enigmaContract = instance;
        principal = new testUtils.Principal (enigmaContract, accounts[9]);

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

        return principal.register ();
    })
    .catch (err => {
        console.error (err);
    });


function get_encryptedAddresses (addresses) {
    let clientPrivKey = '853ee410aa4e7840ca8948b8a2f67e9a1c2f4988ff5f4ec7794edf57be421ae5';
    let enclavePubKey = '0061d93b5412c0c99c3c7867db13c4e13e51292bd52565d002ecf845bb0cfd8adfa5459173364ea8aff3fe24054cca88581f6c3c5e928097b9d4d47fce12ae47';
    let derivedKey = engUtils.getDerivedKey (enclavePubKey, clientPrivKey);
    let encrypted = [];

    addresses.forEach (address => encrypted.push (engUtils.encryptMessage (derivedKey, address)));
    return encrypted;
}