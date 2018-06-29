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

const Enigma = contract (EnigmaContract);
Enigma.setNetwork (1);

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

// This worker impersonates the Principal node and registers if --with-register is specified
const worker = [
    '0xc44205c3aFf78e99049AfeAE4733a3481575CD26',
    '{"id":"306286860802364519834752506973858673005","timestamp":"2018-06-12T17:10:19.129261","isvEnclaveQuoteStatus":"OK","isvEnclaveQuoteBody":"AgAAANoKAAAHAAYAAAAAABYB+Vw5ueowf+qruQGtw+72HPtcKCz63mlimVbjqbE5BAT/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAHAAAAAAAAAKXBP5WZBuLjmngKZ8zzQ2A00leTJBcp9oYT2CDXSNHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACD1xnnferKFHD2uvYqTXdDA8iZ22kCD5xw7h38CMfOngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8G0ljp2XaOXVtOPvA5tngv93F4PXnPFqA6ZnYt5BGhhPYTqeilJHAoMpungy+sJPzQDOLm3hiqQ34tUBCfn2p"}',
    '-----BEGIN CERTIFICATE-----\n' +
    'MIIEoTCCAwmgAwIBAgIJANEHdl0yo7CWMA0GCSqGSIb3DQEBCwUAMH4xCzAJBgNV\n' +
    'BAYTAlVTMQswCQYDVQQIDAJDQTEUMBIGA1UEBwwLU2FudGEgQ2xhcmExGjAYBgNV\n' +
    'BAoMEUludGVsIENvcnBvcmF0aW9uMTAwLgYDVQQDDCdJbnRlbCBTR1ggQXR0ZXN0\n' +
    'YXRpb24gUmVwb3J0IFNpZ25pbmcgQ0EwHhcNMTYxMTIyMDkzNjU4WhcNMjYxMTIw\n' +
    'MDkzNjU4WjB7MQswCQYDVQQGEwJVUzELMAkGA1UECAwCQ0ExFDASBgNVBAcMC1Nh\n' +
    'bnRhIENsYXJhMRowGAYDVQQKDBFJbnRlbCBDb3Jwb3JhdGlvbjEtMCsGA1UEAwwk\n' +
    'SW50ZWwgU0dYIEF0dGVzdGF0aW9uIFJlcG9ydCBTaWduaW5nMIIBIjANBgkqhkiG\n' +
    '9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqXot4OZuphR8nudFrAFiaGxxkgma/Es/BA+t\n' +
    'beCTUR106AL1ENcWA4FX3K+E9BBL0/7X5rj5nIgX/R/1ubhkKWw9gfqPG3KeAtId\n' +
    'cv/uTO1yXv50vqaPvE1CRChvzdS/ZEBqQ5oVvLTPZ3VEicQjlytKgN9cLnxbwtuv\n' +
    'LUK7eyRPfJW/ksddOzP8VBBniolYnRCD2jrMRZ8nBM2ZWYwnXnwYeOAHV+W9tOhA\n' +
    'ImwRwKF/95yAsVwd21ryHMJBcGH70qLagZ7Ttyt++qO/6+KAXJuKwZqjRlEtSEz8\n' +
    'gZQeFfVYgcwSfo96oSMAzVr7V0L6HSDLRnpb6xxmbPdqNol4tQIDAQABo4GkMIGh\n' +
    'MB8GA1UdIwQYMBaAFHhDe3amfrzQr35CN+s1fDuHAVE8MA4GA1UdDwEB/wQEAwIG\n' +
    'wDAMBgNVHRMBAf8EAjAAMGAGA1UdHwRZMFcwVaBToFGGT2h0dHA6Ly90cnVzdGVk\n' +
    'c2VydmljZXMuaW50ZWwuY29tL2NvbnRlbnQvQ1JML1NHWC9BdHRlc3RhdGlvblJl\n' +
    'cG9ydFNpZ25pbmdDQS5jcmwwDQYJKoZIhvcNAQELBQADggGBAGcIthtcK9IVRz4r\n' +
    'Rq+ZKE+7k50/OxUsmW8aavOzKb0iCx07YQ9rzi5nU73tME2yGRLzhSViFs/LpFa9\n' +
    'lpQL6JL1aQwmDR74TxYGBAIi5f4I5TJoCCEqRHz91kpG6Uvyn2tLmnIdJbPE4vYv\n' +
    'WLrtXXfFBSSPD4Afn7+3/XUggAlc7oCTizOfbbtOFlYA4g5KcYgS1J2ZAeMQqbUd\n' +
    'ZseZCcaZZZn65tdqee8UXZlDvx0+NdO0LR+5pFy+juM0wWbu59MvzcmTXbjsi7HY\n' +
    '6zd53Yq5K244fwFHRQ8eOB0IWB+4PfM7FeAApZvlfqlKOlLcZL2uyVmzRkyR5yW7\n' +
    '2uo9mehX44CiPJ2fse9Y6eQtcfEhMPkmHXI01sN+KwPbpA39+xOsStjhP9N1Y1a2\n' +
    'tQAVo+yVgLgV2Hws73Fc0o3wC78qPEA+v2aRs/Be3ZFDgDyghc/1fgU+7C+P6kbq\n' +
    'd4poyb6IW8KCJbxfMJvkordNOgOUUxndPHEi/tb/U7uLjLOgPA==\n' +
    '-----END CERTIFICATE-----',
    '0x368a9bb191b5552c53980f36269b05af127acd4c522a6e9af74534b81c1d7d9097b45703603b67139ec8c77d4c5eded86700ab947e9e429b18c80169c28be08206b55028b8c22ba73afaaed1334e78e96c0c1c690856470e509aa46634a75e976ac5d7ff06ba09f987e67020c2c245ba09d9beb873ae7b19bce49fe631e6d782f3a01e02ef95ef7dc32f13be4de4b9b6958e1b5a76349e2c522a0153859a826ff1354f12b37a1fa42b7ac03ee64e0987453b3a74bbab65d54093801ba76be48ba16e7fe839fc8a219bffdaa9ad15c23a052eb6c9a81102183022c1f98fe661f5154bc60a0ea6842fb64ccb240320ab9c93f9986e4ca24a2b859b305e18dc2b99',
    '0xcf389bf0b861c1cb8906dfbad20db57ccd97ee8027f059fa00f604e6227f99c2',
];

// Function of the CoinMixer contract
// TODO: encrypt the arguments in this test
const callable = 'mixAddresses(uint32,address[],uint256)';
const callback = 'distribute(uint32,address[])';
const encryptedAddresses = [
    '66cc28084054bbe4f805de4ec95ca5d77af2905a779d9f9df7219b544cd7f23084a249bad006a4e84dc0a95880a3b057403ba3bee35c22d3b1b4000102030405060708090a0b',
    '66cc2d2e4952b0bff607a344ce0aa7a506fd970b779d9ee9fe2eee543983f632f7d34bb5d602f1ba6dc0b696564db7bc98262bb5dbeeabbd100a000102030405060708090a0b'
];

let enigma;
let Register;
let enigmaContract;
let tokenContract;
let coinMixerContract;
let principalAccount;
let coinMixerAccounts;

function handleRegister (err, event) {
    console.log ('got Register event', JSON.stringify (event.args));
    if (web3Utils.toChecksumAddress (event.args.custodian) == principalAccount) {
        console.log ('registered principal node')

        // This option is for unit testing only
        // This script is design to detect actual nodes registering to the network
        const registers = process.argv[2];
        if (registers !== '--with-register') {
            console.log ('waiting for the first worker to register');
        }
    }

    const seed = Math.floor (Math.random () * 100000);
    const hash = web3Utils.soliditySha3 ({ t: 'uint256', v: seed });

    console.log ('updating workers parameters with seed', seed);

    let task;
    let dealId;
    const depositAmount = web3Utils.toWei ('1', 'ether');
    const sig = engUtils.sign (worker[4], hash);
    enigmaContract.setWorkersParams (seed, sig, {
        from: principalAccount,
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
            gasTracker.displayStats ()
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
        principalAccount = accounts[9];

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

        console.log ('registering principal node', principalAccount);
        const report = engUtils.encodeReport (
            worker[1],
            worker[2],
            worker[3],
        );
        // Using the same artificial data for all workers
        enigmaContract.register (
            worker[0], report, {
                from: principalAccount,
                gas: 4712388,
                gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
            }
        );
    })
    .catch (err => {
        console.error (err);
    });
