const testUtils = require('../test/test-utils');
const web3Utils = require('web3-utils');
const engUtils = require('../lib/enigma-utils');
const eng = require('../lib/Enigma');


// Add the web3 node module
const Web3 = require('web3');
const contract = require('truffle-contract');
const EnigmaContract = require('../build/contracts/Enigma.json');
const EnigmaTokenContract = require('../build/contracts/EnigmaToken.json');
const CoinMixerContract = require('../build/contracts/CoinMixer.json');

// Currently, the Enigma library relies on contract objects instantiated with truffle-contract
// TODO: should we stick to truffle-contract or use web3?
// Look at the Web3 wrapper of 0x
const Enigma = contract(EnigmaContract);
Enigma.setNetwork(1);
const EnigmaToken = contract(EnigmaTokenContract);
const CoinMixer = contract(CoinMixerContract);

const argv = require('minimist')(process.argv.slice(2));
const url = argv.url || 'http://localhost:8545';
const provider = new Web3.providers.HttpProvider(url);
const web3 = new Web3(provider);

const GAS_PRICE_GWEI = '2'; // To estimate current gas price: https://ethgasstation.info/
let gasTracker = new testUtils.GasTracker(web3, GAS_PRICE_GWEI);

// Workaround for this issue: https://github.com/trufflesuite/truffle-contract/issues/57
[Enigma, EnigmaToken, CoinMixer].forEach(instance => {
    instance.setProvider(provider);
    if (typeof instance.currentProvider.sendAsync !== "function") {
        instance.currentProvider.sendAsync = function () {
            return instance.currentProvider.send.apply(
                instance.currentProvider, arguments
            );
        };
    }
});

// Parameters of the test Coin Mixer deals
const NB_DEALS = 1;
const CALLABLE = 'mixAddresses(uint32,address[],uint256)';
const CALLBACK = 'distribute(uint32,address[])';
const DEPOSIT_ETH = '1';
const PARTICIPANTS = 2;
const ENG_FEE = 1;
const GAS = 4712388;

let enigma;
let principal;
let enigmaContract;
let tokenContract;
let coinMixerContract;
let coinMixerAccounts;
let encryptedAddresses = [];

// Wait for workers to register to the network
// Reparameterize the workers
// Give out a fully executed Coin Mixing deal to the network upon new worker registration
function createDeal(title) {
    // Checks if the register event comes from a worker, not the principal node
    console.log('creating deal', title);

    // Declaring variables for the Coin Mixing Dapp
    let task;
    let dealId;
    const depositAmount = web3Utils.toWei(DEPOSIT_ETH, 'ether');

    console.log('creating coin mixing deal');
    return coinMixerContract.newDeal(title, depositAmount, PARTICIPANTS, {
        from: web3.eth.defaultAccount,
        gas: GAS,
        gasPrice: web3Utils.toWei(GAS_PRICE_GWEI, 'gwei')
    })
        .then(result => {
            gasTracker.logGasUsed(result, 'newDeal');

            const event = result.logs[0];
            if (!event.args._success) {
                throw 'Unable to create coin mixing deal';
            }
            dealId = event.args._dealId.toNumber();
            console.log('created deal', dealId, 'with', PARTICIPANTS, 'participants depositing',
                web3Utils.fromWei(depositAmount, 'ether'), 'ETH');

            // Each participant must make a deposit and enter its dest address
            // The dest address is encrypted locally so it never leave the
            // browser memory in the clear.
            let promises = [];
            for (let i = 0; i < PARTICIPANTS; i++) {
                console.log('participant', coinMixerAccounts[i], 'making deposit');

                // For testing purposes, each participant enter its own address
                // as a dest address. In a real use case, the dest address will be
                // a different wallet (like a wallet created anonymously  using Tor).
                const encryptedAddress = getEncryptedAddress(coinMixerAccounts[i]);
                console.log('encrypted dest address:', coinMixerAccounts[i], '=>', encryptedAddress);
                promises.push(coinMixerContract.makeDeposit(dealId, encryptedAddress, {
                    from: coinMixerAccounts[i],
                    value: depositAmount,
                    gas: GAS,
                    gasPrice: web3Utils.toWei(GAS_PRICE_GWEI, 'gwei')
                }));
                encryptedAddresses.push(encryptedAddress);
                console.log('deposit stored with destination address:', coinMixerAccounts[i]);
            }
            return Promise.all(promises);
        })
        .then(results => {
            gasTracker.logGasUsed(results[0], 'makeDeposit');

            for (let i = 0; i <= 1; i++) {
                const event = results[i].logs[0];
                if (!event.args._success) {
                    throw 'Unable to make deposit ' + coinMixerAccounts[i];
                }
            }
            console.log('deal funded, sending encrypted addresses to Enigma');
            return web3.eth.getBlockNumber();
        })
        .then(blockNumber => {
            // This is where we are giving out a task to the Enigma Network
            // We use the Enigma library which wraps the Enigma Contract
            // and implements cryptographic functions to verify SGX enclaves
            return enigma.createTask(blockNumber,
                coinMixerContract.address,
                CALLABLE,
                [dealId, encryptedAddresses],
                CALLBACK,
                ENG_FEE,
                [eng.Preprocessor.RAND]
            );
        })
        .then(_task => {
            task = _task;
            // Since the computation fee is paid in ENG, and ENG is an ERC20
            // token, we must approve the fee before committing the
            // computation task. The fee is not sent to the worker at this stage
            // It is simply locked in the Enigma contract. Workers only receive
            // their fees after submitted valid results. This will improve in
            // future release as we are building an economic incentives model.

            // To batch approve fees, consider Task.approveFee(tasks, options)
            return task.approveFee({from: web3.eth.defaultAccount});
        })
        .then(result => {
            // Finally, we commit the task. This will call the Enigma contract
            // which emits a ComputeTask event on the Enigma network. The selected worker
            // will execute the task and commit results on chain. Once validated,
            // results will be relayed to the CoinMixer contract using the
            // callback function.
            console.log('giving out task:', task.taskId, 'to signer', task._worker[0]);
            return task.compute({
                from: web3.eth.defaultAccount,
                gas: GAS,
                gasPrice: web3Utils.toWei(GAS_PRICE_GWEI, 'gwei')
            });
        })
        .then(result => {
            // Out of scope for the dapp
            console.log('got tx:', result.tx, 'for task:', task.taskId, '');
            console.log('mined on block:', result.receipt.blockNumber);

            gasTracker.logGasUsed(result, 'compute');
            gasTracker.displayStats();
            setTimeout(() => {
                console.log('waiting for the next worker to register...');
            }, 300);
        })
        .catch(err => {
            console.error(err);
        })
}

let accounts;
web3.eth.getAccounts()
    .then(_accounts => {
        accounts = _accounts;
        web3.eth.defaultAccount = accounts[0];

        coinMixerAccounts = [];
        for (let i = 1; i <= 6; i++) {
            coinMixerAccounts.push(accounts[i]);
        }

        return Enigma.deployed();
    })
    .then(instance => {
        enigmaContract = instance;
        principal = new testUtils.Principal(enigmaContract, accounts[9]);

        return EnigmaToken.deployed();
    })
    .then(instance => {
        tokenContract = instance;
        enigma = new eng.Enigma(enigmaContract, tokenContract);

        return CoinMixer.deployed();
    })
    .then(instance => {
        coinMixerContract = instance;

        return principal.register();
    })
    .then(result => {
        const event = result.logs[0];
        if (!event.args._success) {
            throw 'Unable to register worker';
        }
        return principal.setWorkersParams();
    })
    .then(result => {
        const event = result.logs[0];
        if (!event.args._success) {
            throw 'Unable to set worker params';
        }
        console.log('network using random seed:', event.args.seed.toNumber());

        function handleDistribute(err, event) {
            console.log('got distribute event', JSON.stringify(event.args));
        }

        const Distribute = coinMixerContract.Distribute({fromBlock: 0});
        Distribute.watch(handleDistribute);

        function createDeals(index) {
            return createDeal('Deal #' + index).then(() => {
                index++;
                if (index < NB_DEALS) {
                    return createDeals(index);
                }
            });
        }

        createDeals(0);
    })
    .catch(err => {
        console.error(err);
    });


function getEncryptedAddress(address) {
    let clientPrivKey = '853ee410aa4e7840ca8948b8a2f67e9a1c2f4988ff5f4ec7794edf57be421ae5';
    let enclavePubKey = '0061d93b5412c0c99c3c7867db13c4e13e51292bd52565d002ecf845bb0cfd8adfa5459173364ea8aff3fe24054cca88581f6c3c5e928097b9d4d47fce12ae47';
    let derivedKey = engUtils.getDerivedKey(enclavePubKey, clientPrivKey);
    let encrypted = engUtils.encryptMessage(derivedKey, address);

    return encrypted;
}