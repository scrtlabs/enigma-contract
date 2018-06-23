const web3Utils = require ('web3-utils');
const RLP = require ('rlp');
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
function verifyWorker (signer, encodedReport) {
    const reportArgs = RLP.decode (encodedReport);
    const report = reportArgs[0].toString ('utf8');
    const reportCa = reportArgs[1].toString ('utf8');
    const reportCert = reportArgs[2].toString ('utf8');
    const reportSig = reportArgs[3];
    const pki = forge.pki;

    let cert;
    try {
        cert = pki.certificateFromPem (reportCert);
    } catch (e) {
        return {
            verified: false,
            err: 'Failed to load report certificate: ' + e
        };
    }

    let md = forge.md.sha256.create ();
    md.update (report, 'utf8');

    try {
        // verify data with a public key
        // (defaults to RSASSA PKCS#1 v1.5)
        const verified = cert.publicKey.verify (md.digest ().bytes (), reportSig);
        if (!verified) {
            return {
                verified: false,
                err: 'The signature does not match the signed report'
            };
        }
    } catch (e) {
        return {
            verified: false,
            err: 'Failed to verify the report signature: ' + e
        };
    }

    let caStore;
    try {
        caStore = pki.createCaStore ([reportCa]);
    } catch (e) {
        return {
            verified: false,
            err: 'Failed to load CA certificate: ' + e
        };
    }

    try {
        pki.verifyCertificateChain (caStore, [cert]);
    } catch (e) {
        return {
            verified: false,
            err: 'Failed to verify certificate: ' + e
        };
    }
    return { verified: true, err: undefined };
}

/**
 * Generate a taskId using a hash of all inputs
 * The Enigma contract uses the same logic to generate a matching taskId
 *
 * @param dappContract
 * @param callable
 * @param callableArgs
 * @param blockNumber
 * @returns {Object}
 */
function generateTaskId (dappContract, callable, callableArgs, blockNumber) {
    const taskId = web3Utils.soliditySha3 (
        { t: 'address', v: dappContract },
        { t: 'string', v: callable },
        { t: 'bytes', v: callableArgs },
        { t: 'uint256', v: blockNumber }
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

function checkMethodSignature (methodSig) {
    const rx = /\b\((.*?)\)/g;
    const result= rx.test (methodSig);
    return result;
}


exports.rlpEncode = rlpEncode;
exports.test = () => 'hello2';
exports.generateTaskId = generateTaskId;
exports.verifyWorker = verifyWorker;
exports.selectWorker = selectWorker;
exports.generateNonce = generateNonce;
exports.checkMethodSignature = checkMethodSignature;



