const web3Utils = require ('web3-utils');
const RLP = require ('rlp');
const abi = require ('ethereumjs-abi');
var assert = require ('assert');
const data = require ('../test/data');
var forge = require ('node-forge');

/**
 * Verifies that the worker signer address is associated to an authentic SGX report
 *
 * @param signer
 * @param quote
 * @param report
 * @param reportCa
 * @param reportCert
 * @param reportSig
 */
function verifyWorker (signer, report, reportCa, reportCert, reportSig) {
    const pki = forge.pki;
    const cert = pki.certificateFromPem (reportCert);

    let md = forge.md.sha256.create ();
    md.update (report, 'utf8');
    const signature = Buffer.from (web3Utils.hexToBytes (reportSig));


    // verify data with a public key
    // (defaults to RSASSA PKCS#1 v1.5)
    const verified = cert.publicKey.verify (md.digest ().bytes (), signature);
    if (!verified) {
        throw new Error ('Invalid signature');
    }

    // var caStore = pki.createCaStore([/* PEM-encoded cert */, ...]);
    // noinspection JSUnusedLocalSymbols
    return true;
}

/**
 * Generate a taskId using a hash of all inputs
 * The Enigma contract uses the same logic to generate a matching taskId
 *
 * @param dappContract
 * @param callable
 * @param callableArgs
 * @param nonce
 * @returns {Object}
 */
function generateTaskId (dappContract, callable, callableArgs, nonce) {
    const taskId = web3Utils.soliditySha3 (
        { t: 'address', v: dappContract },
        { t: 'string', v: callable },
        { t: 'bytes', v: callableArgs },
        { t: 'uint256', v: nonce }
    );
    return taskId;
}

/**
 * Running a pseudo-random algo which discovers the worker selected for the task
 *
 * @param seed
 * @param taskId
 * @param workers
 */
function selectWorker (seed, taskId, workers) {
    const hash = web3Utils.soliditySha3 (
        { t: 'uint256', v: seed },
        { t: 'bytes32', v: taskId }
    );
    // The JS % operator does not produce the correct output
    const index = web3Utils.toBN (hash).mod (web3Utils.toBN (workers.length));
    const selectedWorker = workers[index];

    return selectedWorker;
}

function generateNonce () {
    return Math.floor (Math.random () * 1000000);
}

function rlpEncode (args) {
    const encoded = '0x' + RLP.encode (args).toString ('hex');
    return encoded;
}

describe ('enigma', () => {
    let taskId;
    it ('should generate taskId', () => {
        const arg = abi.rawEncode (['string'], ['test']).toString ("hex");
        taskId = generateTaskId ('0x627306090abab3a6e1400e9345bc60c78a8bef57', 'b', arg, 1);

        assert.equal (taskId.length, 66);
    });

    it ('should select worker', () => {
        const params = JSON.parse ('{"seed":"48555","blockNumber":"152","workers":["0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732","0xc5fdf4076b8f3a5357c5e395ab970b5b54098fef","0x821aea9a577a9b44299b9c15c88cf3087f3b5544","0x0d1d4e623d10f9fba5db95830f7d3839406c6af2","0x2932b7a2355d6fecc4b5c0b6bd44cc31df247a2e","0x2191ef87e392377ec08e7c08eb105ef5448eced5","0x0f4f2ac550a1b4e2280d04c21cea7ebd822934b5","0x6330a553fc93768f612722bb8c2ec78ac90b3bbc","0x5aeda56215b167893e80b4fe645ba6d5bab767de"]}');
        const selectedWorker = selectWorker (params.seed, taskId, params.workers);

        assert (web3Utils.isAddress (selectedWorker));
    });

    it ('should verify worker', () => {
        verifyWorker (data.worker[0], data.worker[2], data.worker[3], data.worker[4], data.worker[5]);
        assert (true);
    });
});

exports.test = () => 'hello';
exports.generateTaskId = generateTaskId;
exports.verifyWorker = verifyWorker;
exports.selectWorker = selectWorker;
exports.generateNonce = generateNonce;
exports.rlpEncode = rlpEncode;



