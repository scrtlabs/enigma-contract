const web3Utils = require ('web3-utils');
const RLP = require ('rlp');
const forge = require ('node-forge');
const pki = forge.pki;
var ed25519 = forge.pki.ed25519;

const INTEL_CA = '-----BEGIN CERTIFICATE-----\n' +
    'MIIFSzCCA7OgAwIBAgIJANEHdl0yo7CUMA0GCSqGSIb3DQEBCwUAMH4xCzAJBgNV\n' +
    'BAYTAlVTMQswCQYDVQQIDAJDQTEUMBIGA1UEBwwLU2FudGEgQ2xhcmExGjAYBgNV\n' +
    'BAoMEUludGVsIENvcnBvcmF0aW9uMTAwLgYDVQQDDCdJbnRlbCBTR1ggQXR0ZXN0\n' +
    'YXRpb24gUmVwb3J0IFNpZ25pbmcgQ0EwIBcNMTYxMTE0MTUzNzMxWhgPMjA0OTEy\n' +
    'MzEyMzU5NTlaMH4xCzAJBgNVBAYTAlVTMQswCQYDVQQIDAJDQTEUMBIGA1UEBwwL\n' +
    'U2FudGEgQ2xhcmExGjAYBgNVBAoMEUludGVsIENvcnBvcmF0aW9uMTAwLgYDVQQD\n' +
    'DCdJbnRlbCBTR1ggQXR0ZXN0YXRpb24gUmVwb3J0IFNpZ25pbmcgQ0EwggGiMA0G\n' +
    'CSqGSIb3DQEBAQUAA4IBjwAwggGKAoIBgQCfPGR+tXc8u1EtJzLA10Feu1Wg+p7e\n' +
    'LmSRmeaCHbkQ1TF3Nwl3RmpqXkeGzNLd69QUnWovYyVSndEMyYc3sHecGgfinEeh\n' +
    'rgBJSEdsSJ9FpaFdesjsxqzGRa20PYdnnfWcCTvFoulpbFR4VBuXnnVLVzkUvlXT\n' +
    'L/TAnd8nIZk0zZkFJ7P5LtePvykkar7LcSQO85wtcQe0R1Raf/sQ6wYKaKmFgCGe\n' +
    'NpEJUmg4ktal4qgIAxk+QHUxQE42sxViN5mqglB0QJdUot/o9a/V/mMeH8KvOAiQ\n' +
    'byinkNndn+Bgk5sSV5DFgF0DffVqmVMblt5p3jPtImzBIH0QQrXJq39AT8cRwP5H\n' +
    'afuVeLHcDsRp6hol4P+ZFIhu8mmbI1u0hH3W/0C2BuYXB5PC+5izFFh/nP0lc2Lf\n' +
    '6rELO9LZdnOhpL1ExFOq9H/B8tPQ84T3Sgb4nAifDabNt/zu6MmCGo5U8lwEFtGM\n' +
    'RoOaX4AS+909x00lYnmtwsDVWv9vBiJCXRsCAwEAAaOByTCBxjBgBgNVHR8EWTBX\n' +
    'MFWgU6BRhk9odHRwOi8vdHJ1c3RlZHNlcnZpY2VzLmludGVsLmNvbS9jb250ZW50\n' +
    'L0NSTC9TR1gvQXR0ZXN0YXRpb25SZXBvcnRTaWduaW5nQ0EuY3JsMB0GA1UdDgQW\n' +
    'BBR4Q3t2pn680K9+QjfrNXw7hwFRPDAfBgNVHSMEGDAWgBR4Q3t2pn680K9+Qjfr\n' +
    'NXw7hwFRPDAOBgNVHQ8BAf8EBAMCAQYwEgYDVR0TAQH/BAgwBgEB/wIBADANBgkq\n' +
    'hkiG9w0BAQsFAAOCAYEAeF8tYMXICvQqeXYQITkV2oLJsp6J4JAqJabHWxYJHGir\n' +
    'IEqucRiJSSx+HjIJEUVaj8E0QjEud6Y5lNmXlcjqRXaCPOqK0eGRz6hi+ripMtPZ\n' +
    'sFNaBwLQVV905SDjAzDzNIDnrcnXyB4gcDFCvwDFKKgLRjOB/WAqgscDUoGq5ZVi\n' +
    'zLUzTqiQPmULAQaB9c6Oti6snEFJiCQ67JLyW/E83/frzCmO5Ru6WjU4tmsmy8Ra\n' +
    'Ud4APK0wZTGtfPXU7w+IBdG5Ez0kE1qzxGQaL4gINJ1zMyleDnbuS8UicjJijvqA\n' +
    '152Sq049ESDz+1rRGc2NVEqh1KaGXmtXvqxXcTB+Ljy5Bw2ke0v8iGngFBPqCTVB\n' +
    '3op5KBG3RjbF6RRSzwzuWfL7QErNC8WEy5yDVARzTA5+xmBc388v9Dm21HGfcC8O\n' +
    'DD+gT9sSpssq0ascmvH49MOgjt1yoysLtdCtJW/9FZpoOypaHx0R+mJTLwPXVMrv\n' +
    'DaVzWh5aiEx+idkSGMnX\n' +
    '-----END CERTIFICATE-----';

function readCert (pem) {
    let cert;
    try {
        cert = pki.certificateFromPem (pem);
    } catch (e) {
        return {
            verified: false,
            err: 'Failed to load report certificate: ' + e
        };
    }
    return cert;
}

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
    const reportCert = reportArgs[2].toString ('utf8');
    const reportSig = reportArgs[3];

    const cert = readCert (reportCert);
    let md = forge.md.sha256.create ();
    md.update (report, 'utf8');

    try {
        // verify data with a public key
        // (defaults to RSASSA PKCS#1 v1.5)
        // TODO: verify that the public key belongs to the signer
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
        caStore = pki.createCaStore ([INTEL_CA]);
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
    const result = rx.test (methodSig);
    return result;
}

function toAddress (publicKey) {
    const key = web3Utils.toHex(publicKey.publicKey) ;
    // const address = EthCrypto.publicKey.toAddress(
    //     'bf1cc3154424dc22191941d9f4f50b063a2b663a2337e5548abea633c1d06ece...'
    // );
}

function sign(message, privateKey) {
    const key = pki.privateKeyFromPem(privateKey);
    key.publicKeyByPrivateKey
    console.log();
}

exports.readCert = readCert;
exports.rlpEncode = rlpEncode;
exports.test = () => 'hello2';
exports.generateTaskId = generateTaskId;
exports.verifyWorker = verifyWorker;
exports.selectWorker = selectWorker;
exports.generateNonce = generateNonce;
exports.checkMethodSignature = checkMethodSignature;
exports.toAddress = toAddress;
exports.sign = sign;



