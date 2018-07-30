const web3Utils = require ('web3-utils');
const engUtils = require ('../lib/enigma-utils');
const EthCrypto = require ('eth-crypto');

const GAS_PRICE_GWEI = '2'; // To estimate current gas price: https://ethgasstation.info/

class GasTracker {
    constructor (web3, gasPrice) {
        this.web3 = web3;
        this.gasUsed = [];
        this.gasPrice = gasPrice;
    }

    logGasUsed (result, fn) {
        const gasUsed = web3Utils.toBN (result.receipt.gasUsed);

        this.gasUsed.push (this.web3.eth.getTransaction (result.tx).then (tx => {
            const gasPrice = web3Utils.toBN (tx.gasPrice);
            const gasWei = gasUsed.mul (gasPrice);
            // console.log (fn + ' gas used:', web3Utils.fromWei (gasWei));
            return [fn, gasWei];
        }));
    }

    displayStats () {
        return Promise.all (this.gasUsed).then (gasUsed => {
            console.log ('Cost of transactions based on gas price:', this.gasPrice, 'gwei');
            gasUsed.forEach (fnGas => {
                console.log (fnGas[0], 'gas used:', web3Utils.fromWei (fnGas[1]), 'ETH');
            });
            return true;
        });
    }

    getGasPrice () {
        return web3Utils.toWei (this.gasPrice, 'gwei');
    }
}

// This worker impersonates the Principal node and registers if --with-register is specified
const PRINCIPAL = [
    '0xc44205c3aFf78e99049AfeAE4733a3481575CD26', // Signer address of principal node
    '{"id":"306286860802364519834752506973858673005","timestamp":"2018-06-12T17:10:19.129261","isvEnclaveQuoteStatus":"OK","isvEnclaveQuoteBody":"AgAAANoKAAAHAAYAAAAAABYB+Vw5ueowf+qruQGtw+72HPtcKCz63mlimVbjqbE5BAT/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAHAAAAAAAAAKXBP5WZBuLjmngKZ8zzQ2A00leTJBcp9oYT2CDXSNHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACD1xnnferKFHD2uvYqTXdDA8iZ22kCD5xw7h38CMfOngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8G0ljp2XaOXVtOPvA5tngv93F4PXnPFqA6ZnYt5BGhhPYTqeilJHAoMpungy+sJPzQDOLm3hiqQ34tUBCfn2p"}', //Report
    '-----BEGIN CERTIFICATE-----\n' + // x.509 certificate of the report
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
    '0x368a9bb191b5552c53980f36269b05af127acd4c522a6e9af74534b81c1d7d9097b45703603b67139ec8c77d4c5eded86700ab947e9e429b18c80169c28be08206b55028b8c22ba73afaaed1334e78e96c0c1c690856470e509aa46634a75e976ac5d7ff06ba09f987e67020c2c245ba09d9beb873ae7b19bce49fe631e6d782f3a01e02ef95ef7dc32f13be4de4b9b6958e1b5a76349e2c522a0153859a826ff1354f12b37a1fa42b7ac03ee64e0987453b3a74bbab65d54093801ba76be48ba16e7fe839fc8a219bffdaa9ad15c23a052eb6c9a81102183022c1f98fe661f5154bc60a0ea6842fb64ccb240320ab9c93f9986e4ca24a2b859b305e18dc2b99', // Signatuire of the report signed with the public key of the certificate
    '0xcf389bf0b861c1cb8906dfbad20db57ccd97ee8027f059fa00f604e6227f99c2', // The signer private key (always concealed in SGX)
];

class Principal {
    constructor (contract, custodian) {
        this.contract = contract;
        this.params = PRINCIPAL;
        this.custodian = custodian;
    }

    register () {
        //***** Simulating the principal node
        console.log ('registering principal', this.custodian);
        const report = engUtils.encodeReport (
            this.params[1],
            this.params[2],
            this.params[3],
        );
        // Using the same artificial data for all workers
        return this.contract.register (
            this.params[0], report, {
                from: this.custodian,
                gas: 4712388,
                gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
            }
        );
    }

    setWorkersParams () {
        // Generate a random seed for convenience
        // In a prod network, this code will be in the principal node, not in a script like this
        const seed = Math.floor (Math.random () * 100000);
        const hash = web3Utils.soliditySha3 ({ t: 'uint256', v: seed });

        const sig = engUtils.sign (this.params[4], hash);
        const signer = EthCrypto.recoverPublicKey (sig, hash);
        if (engUtils.toAddress (signer) !== this.params[0]) throw 'invalid principal signature';

        console.log ('updating workers parameters with seed', seed);
        return this.contract.setWorkersParams (seed, sig, {
            from: this.custodian,
            gas: 4712388,
            gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
        });
    }
}

exports.GasTracker = GasTracker;
exports.Principal = Principal;
