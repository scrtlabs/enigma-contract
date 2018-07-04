const web3Utils = require ('web3-utils');
const RLP = require ('rlp');
const forge = require ('node-forge');
const pki = forge.pki;
const EthCrypto = require ('eth-crypto');
const EC = require('elliptic').ec; 

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

function parsePublicKey (report) {

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
    // console.log ('decoding report\n', reportArgs[0], '\n', reportArgs[1], '\n', reportArgs[2]);
    const report = reportArgs[0].toString ('utf8');
    const reportCert = reportArgs[1].toString ('utf8');
    const reportSig = reportArgs[2];

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

function encodeReport (report, cert, sig) {
    return '0x' + RLP.encode ([report, cert, sig]).toString ('hex');
}

/**
 * Verifies that the specified method signature matches the specs defined
 * by the Ethereum abi: https://github.com/ethereum/wiki/wiki/Ethereum-Contract-ABI#function-selector-and-argument-encoding
 * @param methodSig
 * @returns {boolean}
 */
function checkMethodSignature (methodSig) {
    const rx = /\b\((.*?)\)/g;
    const result = rx.test (methodSig);
    return result;
}

function toAddress (publicKey) {
    const address = EthCrypto.publicKey.toAddress (publicKey);
    // TODO: eth-crypto gives a different address. Who's right?
    // const hash = web3Utils.soliditySha3 (publicKey);
    // const address = web3Utils.toChecksumAddress ('0x' + hash.substr (hash.length - 40));
    return address;
}

function sign (privateKey, message) {
    const signature = EthCrypto.sign (
        privateKey,
        message
    );
    return signature;
}
/**
 * This does ECDH key derivation from 2 EC secp256k1 keys.
 * It does so by multiplying the public points by the private point of the over key.
 * This results in a X and Y. it then replaces the Y with 0x02 if Y is even and 0x03 if it's odd.
 * Then it hashes the new Y together with the X using SHA256.
 * Multiplication: https://github.com/indutny/elliptic/blob/master/lib/elliptic/ec/key.js#L104
 * Replacing Y: https://source.that.world/source/libsecp256k1-rs/browse/master/src/ecdh.rs$25
 * 
 * @param enclavePublicKey 
 * @param clientPrivateKey 
 * @returns {string}
 */
function getDerivedKey (enclavePublicKey, clientPrivateKey) {
    let ec = new EC('secp256k1');
    if (enclavePublicKey.slice(0,2) != '04') {
        enclavePublicKey = '04' + enclavePublicKey;
    }
    console.log(enclavePublicKey)
    let client_key = ec.keyFromPrivate(clientPrivateKey, 'hex');
    let enclave_key = ec.keyFromPublic(enclavePublicKey, 'hex');

    let shared_points = enclave_key.getPublic().mul(client_key.getPrivate());

    let y = 0x02 | (shared_points.getY().isOdd()?1:0);
    let x = shared_points.getX();
    let y_buffer = Buffer.from([y]);
    let x_buffer = Buffer.from(x.toString(16), 'hex');

    let sha256 = forge.md.sha256.create();
    sha256.update(y_buffer.toString('binary'));
    sha256.update(x_buffer.toString('binary'));

    return sha256.digest().toHex();
}

/**
 * Decrypts the encrypted message:
 * Message format: encrypted_message[*]tag[16]iv[12] (represented as: var_name[len])
 * 
 * @param key_hex 
 * @param msg 
 * @returns {string}
 */
function decryptMessage (key_hex, msg) {
    let key = forge.util.hexToBytes(key_hex);
    let msg_buf = Buffer.from(msg, 'hex');
    let iv = forge.util.createBuffer(msg_buf.slice(-12).toString('binary'));
    let tag = forge.util.createBuffer(msg_buf.slice(-28, -12).toString('binary'));
    const decipher = forge.cipher.createDecipher('AES-GCM', key);

    decipher.start( {iv: iv, tag: tag} );
    decipher.update(forge.util.createBuffer(msg_buf.slice(0, -28).toString('binary')));
    if (decipher.finish()) {
        return decipher.output.getBytes();
    }
}
/**
 * Encrypts a message using the provided key.
 * Returns an encrypted message in this format:
 * encrypted_message[*]tag[16]iv[12] (represented as: var_name[len])
 * 
 * @param key_hex 
 * @param msg 
 * @param iv 
 * @returns {string}
 */
function encryptMessage (key_hex, msg, iv=forge.random.getBytesSync(12)) {
    let key = forge.util.hexToBytes(key_hex);
    const cipher = forge.cipher.createCipher('AES-GCM', key);

    cipher.start( {iv: iv} );
    cipher.update(forge.util.createBuffer(msg));
    cipher.finish();

    let result = cipher.output.putBuffer(cipher.mode.tag).putBytes(iv);
    return result.toHex();
}

exports.readCert = readCert;
exports.encodeReport = encodeReport;
exports.test = () => 'hello2';
exports.generateTaskId = generateTaskId;
exports.verifyWorker = verifyWorker;
exports.selectWorker = selectWorker;
exports.checkMethodSignature = checkMethodSignature;
exports.toAddress = toAddress;
exports.sign = sign;
exports.getDerivedKey = getDerivedKey;
exports.encryptMessage = encryptMessage;
exports.decryptMessage = decryptMessage;

// Create and initialize EC context
// (better do it once and reuse it)
var ec = new EC('secp256k1');

var a = ec.genKeyPair().getPublic().encode('hex')
var b = ec.genKeyPair().getPrivate().toString(16);
// console.log(a)
// console.log(b)
getDerivedKey(a.slice(2), b)