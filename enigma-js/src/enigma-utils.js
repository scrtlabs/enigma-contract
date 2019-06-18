import JSBI from 'jsbi';
import web3Utils from 'web3-utils';
// import RLP from 'rlp';
import forge from 'node-forge';
import elliptic from 'elliptic';
import {Buffer} from 'buffer';
import zlib from 'zlib';

forge.options.usePureJavaScript = true;

const EC = elliptic.ec;

// const pki = forge.pki;

// const INTEL_CA = '-----BEGIN CERTIFICATE-----\n' +
//   'MIIFSzCCA7OgAwIBAgIJANEHdl0yo7CUMA0GCSqGSIb3DQEBCwUAMH4xCzAJBgNV\n' +
//   'BAYTAlVTMQswCQYDVQQIDAJDQTEUMBIGA1UEBwwLU2FudGEgQ2xhcmExGjAYBgNV\n' +
//   'BAoMEUludGVsIENvcnBvcmF0aW9uMTAwLgYDVQQDDCdJbnRlbCBTR1ggQXR0ZXN0\n' +
//   'YXRpb24gUmVwb3J0IFNpZ25pbmcgQ0EwIBcNMTYxMTE0MTUzNzMxWhgPMjA0OTEy\n' +
//   'MzEyMzU5NTlaMH4xCzAJBgNVBAYTAlVTMQswCQYDVQQIDAJDQTEUMBIGA1UEBwwL\n' +
//   'U2FudGEgQ2xhcmExGjAYBgNVBAoMEUludGVsIENvcnBvcmF0aW9uMTAwLgYDVQQD\n' +
//   'DCdJbnRlbCBTR1ggQXR0ZXN0YXRpb24gUmVwb3J0IFNpZ25pbmcgQ0EwggGiMA0G\n' +
//   'CSqGSIb3DQEBAQUAA4IBjwAwggGKAoIBgQCfPGR+tXc8u1EtJzLA10Feu1Wg+p7e\n' +
//   'LmSRmeaCHbkQ1TF3Nwl3RmpqXkeGzNLd69QUnWovYyVSndEMyYc3sHecGgfinEeh\n' +
//   'rgBJSEdsSJ9FpaFdesjsxqzGRa20PYdnnfWcCTvFoulpbFR4VBuXnnVLVzkUvlXT\n' +
//   'L/TAnd8nIZk0zZkFJ7P5LtePvykkar7LcSQO85wtcQe0R1Raf/sQ6wYKaKmFgCGe\n' +
//   'NpEJUmg4ktal4qgIAxk+QHUxQE42sxViN5mqglB0QJdUot/o9a/V/mMeH8KvOAiQ\n' +
//   'byinkNndn+Bgk5sSV5DFgF0DffVqmVMblt5p3jPtImzBIH0QQrXJq39AT8cRwP5H\n' +
//   'afuVeLHcDsRp6hol4P+ZFIhu8mmbI1u0hH3W/0C2BuYXB5PC+5izFFh/nP0lc2Lf\n' +
//   '6rELO9LZdnOhpL1ExFOq9H/B8tPQ84T3Sgb4nAifDabNt/zu6MmCGo5U8lwEFtGM\n' +
//   'RoOaX4AS+909x00lYnmtwsDVWv9vBiJCXRsCAwEAAaOByTCBxjBgBgNVHR8EWTBX\n' +
//   'MFWgU6BRhk9odHRwOi8vdHJ1c3RlZHNlcnZpY2VzLmludGVsLmNvbS9jb250ZW50\n' +
//   'L0NSTC9TR1gvQXR0ZXN0YXRpb25SZXBvcnRTaWduaW5nQ0EuY3JsMB0GA1UdDgQW\n' +
//   'BBR4Q3t2pn680K9+QjfrNXw7hwFRPDAfBgNVHSMEGDAWgBR4Q3t2pn680K9+Qjfr\n' +
//   'NXw7hwFRPDAOBgNVHQ8BAf8EBAMCAQYwEgYDVR0TAQH/BAgwBgEB/wIBADANBgkq\n' +
//   'hkiG9w0BAQsFAAOCAYEAeF8tYMXICvQqeXYQITkV2oLJsp6J4JAqJabHWxYJHGir\n' +
//   'IEqucRiJSSx+HjIJEUVaj8E0QjEud6Y5lNmXlcjqRXaCPOqK0eGRz6hi+ripMtPZ\n' +
//   'sFNaBwLQVV905SDjAzDzNIDnrcnXyB4gcDFCvwDFKKgLRjOB/WAqgscDUoGq5ZVi\n' +
//   'zLUzTqiQPmULAQaB9c6Oti6snEFJiCQ67JLyW/E83/frzCmO5Ru6WjU4tmsmy8Ra\n' +
//   'Ud4APK0wZTGtfPXU7w+IBdG5Ez0kE1qzxGQaL4gINJ1zMyleDnbuS8UicjJijvqA\n' +
//   '152Sq049ESDz+1rRGc2NVEqh1KaGXmtXvqxXcTB+Ljy5Bw2ke0v8iGngFBPqCTVB\n' +
//   '3op5KBG3RjbF6RRSzwzuWfL7QErNC8WEy5yDVARzTA5+xmBc388v9Dm21HGfcC8O\n' +
//   'DD+gT9sSpssq0ascmvH49MOgjt1yoysLtdCtJW/9FZpoOypaHx0R+mJTLwPXVMrv\n' +
//   'DaVzWh5aiEx+idkSGMnX\n' +
//   '-----END CERTIFICATE-----';

// /**
//  * Serialize the pem cert.
//  *
//  * @param {string} pem
//  * @return {*}
//  */
// function readCert(pem) {
//   let cert;
//
//   try {
//     cert = pki.certificateFromPem(pem);
//   } catch (e) {
//     return {
//       verified: false,
//       err: 'Failed to load report certificate : ' + e,
//     };
//   }
//   return cert;
// }

// /**
//  * Parse the signer's address from the quote
//  *
//  * @param {string} reportContent
//  * @return {string}
//  */
// function parseAddress(reportContent) {
//   const report = JSON.parse(reportContent);
//   let b = new Buffer(report.isvEnclaveQuoteBody, 'base64');
//
//   return b.slice(368, 410).toString();
// }

// /**
//  * Verifies that the worker signer address is associated to an authentic SGX report
//  *
//  * @param {string} signer
//  * @param {string} encodedReport
//  * @return {*}
//  */
// function verifyWorker(signer, encodedReport) {
//   const reportArgs = RLP.decode(encodedReport);
//   // console.log ('decoding report\n', reportArgs[0], '\n', reportArgs[1], '\n', reportArgs[2]);
//   const report = reportArgs[0].toString('utf8');
//
//   if (report === 'simulation') {
//     return {
//       verified: true,
//       err: 'Running in simulation mode',
//     };
//   }
//
//   const reportCert = reportArgs[1].toString('utf8');
//   const reportSig = reportArgs[2];
//   const cert = readCert(reportCert);
//   let md = forge.md.sha256.create();
//
//   md.update(report, 'utf8');
//
//   try {
//     // verify data with a public key
//     // (defaults to RSASSA PKCS#1 v1.5)
//     // TODO: verify that the public key belongs to the signer
//     const verified = cert.publicKey.verify(md.digest().bytes(), reportSig);
//
//     if (!verified) {
//       return {
//         verified: false,
//         err: 'The signature does not match the signed report',
//       };
//     }
//   } catch (e) {
//     return {
//       verified: false,
//       err: 'Failed to verify the report signature: ' + e,
//     };
//   }
//
//   let caStore;
//
//   try {
//     caStore = pki.createCaStore([INTEL_CA]);
//   } catch (e) {
//     return {
//       verified: false,
//       err: 'Failed to load CA certificate: ' + e,
//     };
//   }
//
//   try {
//     pki.verifyCertificateChain(caStore, [cert]);
//   } catch (e) {
//     return {
//       verified: false,
//       err: 'Failed to verify certificate: ' + e,
//     };
//   }
//
//   const address = parseAddress(report);
//
//   if (address !== signer) {
//     return {
//       verified: false,
//       err: 'Signer address does not match the report: ' + signer + ' != ' +
//         address,
//     };
//   }
//
//   return {verified: true, err: undefined};
// }

// /**
//  * Encode secret contract function arguments
//  *
//  * @param {Object} args
//  * @return {string}
//  */
// function encodeArguments(args) {
//   return '0x' + RLP.encode(args).toString('hex');
// }

/**
 * Generate a taskId using a hash of all inputs
 * The Enigma contract uses the same logic to generate a matching taskId
 *
 * @param {string} sender
 * @param {Number} nonce
 * @return {string}
 */
function generateScAddr(sender, nonce) {
  return web3Utils.soliditySha3(
    {t: 'bytes', v: sender},
    {t: 'uint', v: nonce},
  );
}

/**
 * Generate a taskId using a hash of all inputs
 * The Enigma contract uses the same logic to generate a matching taskId
 *
 * @param {string} hexStr - Buffer being appended to
 * @param {Array} inputsArray - Array of inputs
 * @return {string} - Final appended hex string
 */
function appendMessages(hexStr, inputsArray) {
  for (let input of inputsArray) {
    input = remove0x(input);
    // since the inputs are in hex string, they are twice as long as their bytes
    hexStr += JSBI.BigInt(input.length/2).toString(16).padStart(16, '0') + input;
  }
  return hexStr;
}

/**
 * Generate a hash of an array containing an array of inputs
 *
 * @param {string} hexStr - Buffer being appended to
 * @param {Array} inputsArray - Array of array of inputs
 * @return {string} - Final appended hex string
 */
function appendArrayMessages(hexStr, inputsArray) {
  for (let array of inputsArray) {
    hexStr += JSBI.BigInt(array.length).toString(16).padStart(16, '0');
    hexStr = appendMessages(hexStr, array);
  }
  return hexStr;
}

/**
 * Generate a hash of all inputs
 *
 * @param {array} inputsArray - Array of inputs
 * @return {string} Hash of inputs
 */
function hash(inputsArray) {
  let hexStr = appendMessages('', inputsArray);
  return web3Utils.soliditySha3({t: 'bytes', v: hexStr});
}

/**
 * Generate a hash of inputs for setting the worker params from the principal node
 *
 * @param {Number} seed - The random integer generated by the enclave
 * @param {Number} nonce - Nonce value for principal node
 * @param {Array} workerAddresses - Worker signing addresses
 * @param {Array} workerStakes - Worker stake balances
 * @return {string} Hash of inputs
 */
function principalHash(seed, nonce, workerAddresses, workerStakes) {
  let hexStr = '';
  hexStr = appendMessages(hexStr, [seed, nonce]);
  hexStr = appendArrayMessages(hexStr, [workerAddresses, workerStakes]);
  return web3Utils.soliditySha3({t: 'bytes', v: hexStr});
}

/**
 * Generate a hash of inputs necessary for commit multiple receipts logic
 *
 * @param {string} codeHash
 * @param {Array} inputsHashes
 * @param {string} lastStateDeltaHash
 * @param {Array} stateDeltaHashes
 * @param {Array} outputHashes
 * @param {Array} gasesUsed
 * @param {string} optionalEthereumData
 * @param {string} optionalEthereumContractAddress
 * @param {string} successFlag
 * @return {string} hash of inputs
 */
function commitReceiptsHash(codeHash, inputsHashes, lastStateDeltaHash, stateDeltaHashes, outputHashes, gasesUsed,
                            optionalEthereumData, optionalEthereumContractAddress, successFlag) {
  let hexStr = '';
  hexStr = appendMessages(hexStr, [codeHash]);
  hexStr = appendArrayMessages(hexStr, [inputsHashes]);
  hexStr = appendMessages(hexStr, [lastStateDeltaHash]);
  hexStr = appendArrayMessages(hexStr, [stateDeltaHashes, outputHashes, gasesUsed]);
  hexStr = appendMessages(hexStr, [optionalEthereumData, optionalEthereumContractAddress, successFlag]);

  return web3Utils.soliditySha3({t: 'bytes', v: hexStr});
}

// /**
//  * RLP encode report parts
//  *
//  * @param {string} report
//  * @param {string} cert
//  * @param {string} sig
//  * @return {string}
//  */
// function encodeReport(report, cert, sig) {
//   return '0x' + RLP.encode([report, cert, sig]).toString('hex');
// }

// /**
//  * Verifies that the specified method signature matches the specs defined
//  * by the Ethereum abi: https://github.com/ethereum/wiki/wiki/Ethereum-Contract-ABI
//  *
//  * @param {string} methodSig
//  * @return {boolean}
//  */
// function checkMethodSignature(methodSig) {
//   const rx = /\b\((.*?)\)/g;
//   const result = rx.test(methodSig);
//
//   return result;
// }

// /**
//  * Generate an Ethereum-like address from a public key
//  *
//  * @param {string} publicKey
//  * @return {string}
//  */
// function toAddress(publicKey) {
//   const address = EthCrypto.publicKey.toAddress(publicKey);
//
//   return address;
// }

// /**
//  * Sign a message with the specified private key
//  *
//  * @param {string} privateKey
//  * @param {string} message
//  * @return {string}
//  */
// function sign(privateKey, message) {
//   return EthCrypto.sign(
//     privateKey,
//     message,
//   );
// }

// /**
//  * Returns the address with which the message was signed
//  *
//  * @param {string} signature
//  * @param {string} message
//  * @return {string}
//  */
// function recover(signature, message) {
//   return EthCrypto.recover(
//     signature,
//     message,
//   );
// }

// /**
//  * Returns the public key associated with the message signature
//  *
//  * @param {string} signature
//  * @param {string} message
//  * @return {string} Public key
//  */
// function recoverPublicKey(signature, message) {
//   return EthCrypto.recoverPublicKey(
//     signature,
//     message,
//   );
// }

/**
 * This does ECDH key derivation from 2 EC secp256k1 keys.
 * It does so by multiplying the public points by the private point of the over key.
 * This results in a X and Y. it then replaces the Y with 0x02 if Y is even and 0x03 if it's odd.
 * Then it hashes the new Y together with the X using SHA256.
 * Multiplication: https://github.com/indutny/elliptic/blob/master/lib/elliptic/ec/key.js#L104
 * Replacing Y: https://source.that.world/source/libsecp256k1-rs/browse/master/src/ecdh.rs$25
 *
 * @param {string} enclavePublicKey
 * @param {string} clientPrivateKey
 * @return {string}
 */
function getDerivedKey(enclavePublicKey, clientPrivateKey) {
  let ec = new EC('secp256k1');

  if (enclavePublicKey.length == 128) {
    enclavePublicKey = '04' + enclavePublicKey;
  }

  let clientKey = ec.keyFromPrivate(clientPrivateKey, 'hex');
  let enclaveKey = ec.keyFromPublic(enclavePublicKey, 'hex');

  let sharedPoints = enclaveKey.getPublic().mul(clientKey.getPrivate());
  let y = 0x02 | (sharedPoints.getY().isOdd() ? 1 : 0);
  let x = sharedPoints.getX();
  let yBuffer = Buffer.from([y]);
  let xBuffer = x.toArrayLike(Buffer, 'be', 32);

  let sha256 = forge.md.sha256.create();

  sha256.update(yBuffer.toString('binary'));
  sha256.update(xBuffer.toString('binary'));

  return sha256.digest().toHex();
}

/**
 * Decrypts the encrypted message:
 * Message format: encrypted_message[*]tag[16]iv[12] (represented as: var_name[len])
 *
 * @param {string} keyHex - Derived key
 * @param {string} msgHex - Encrypted message
 * @return {string} Decrypted message
 */
function decryptMessage(keyHex, msgHex) {
  let key = forge.util.hexToBytes(keyHex);
  let msgBuf = Buffer.from(msgHex, 'hex');
  let iv = forge.util.createBuffer(msgBuf.slice(-12));
  let tag = forge.util.createBuffer(msgBuf.slice(-28, -12));
  const decipher = forge.cipher.createDecipher('AES-GCM', key);

  decipher.start({iv: iv, tag: tag});
  decipher.update(
    forge.util.createBuffer(msgBuf.slice(0, -28)));

  if (decipher.finish()) {
    return decipher.output.toHex();
  }
  throw new Error('decipher did not finish');
}

/**
 * Encrypts a message using the provided key.
 * Returns an encrypted message in this format:
 * encrypted_message[*]tag[16]iv[12] (represented as: var_name[len])
 *
 * @param {string} keyHex - Derived key
 * @param {string} msg - Unencrypted message
 * @param {string} iv
 * @return {string} Encrypted message
 */
function encryptMessage(keyHex, msg, iv = forge.random.getBytesSync(12)) {
  let key = forge.util.hexToBytes(keyHex);
  const cipher = forge.cipher.createCipher('AES-GCM', key);

  cipher.start({iv: iv});
  cipher.update(forge.util.createBuffer(msg));
  cipher.finish();

  let result = cipher.output.putBuffer(cipher.mode.tag).putBytes(iv);

  return result.toHex();
}

/**
 * Converts ENG value to grains format.
 *
 * @param {int} engValue
 * @return {int} ENG value in grains format
 */
function toGrains(engValue) {
  return engValue * 10**8;
}

// /**
//  * Converts grains format to ENG value.
//  *
//  * @param {int} grains
//  * @return {int}
//  */
// function fromGrains(grains) {
//   return grains / 10**8;
// }

/**
 * Removes '0x' from a hex string, if present
 *
 * @param {string} hexString
 * @return {string}
 */
function remove0x(hexString) {
  if (hexString.substring(0, 2) == '0x') {
    return hexString.substring(2);
  } else {
    return hexString;
  }
}

/**
 * Converts a hex string to its ASCII representation
 *
 * @param {string} hexString
 * @return {string}
 */
function hexToAscii(hexString) {
  if (!(typeof hexString === 'number' || typeof hexString == 'string')) {
    return '';
  }
  hexString = hexString.toString().replace(/\s+/gi, '');
  const stack = [];
  for (let n = 0; n < hexString.length; n += 2) {
    const code = parseInt(hexString.substr(n, 2), 16);
    if (!isNaN(code) && code !== 0) {
      stack.push(String.fromCharCode(code));
    }
  }
  return stack.join('');
}

/**
 * Sleeps
 *
 * @param {int} ms
 * @return {undefined}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compress using GZIP
 *  @param {Buffer} buffer to compress
 *  @return {Promise}
 * */
function gzip(buffer) {
  return new Promise((resolve, reject)=> {
    zlib.gzip(buffer, (error, result)=>{
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

/** Unzip using GZIP
 *  @param {Buffer} buffer compressed
 *  @return {Promise}
 * */
function gunzip(buffer) {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buffer, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}


let utils = {};

// utils.readCert = readCert;
// utils.encodeReport = encodeReport;
utils.test = () => 'hello2';
// utils.encodeArguments = encodeArguments;
utils.generateScAddr = generateScAddr;
utils.hash = hash;
utils.principalHash = principalHash;
utils.commitReceiptsHash = commitReceiptsHash;
// utils.verifyWorker = verifyWorker;
// utils.checkMethodSignature = checkMethodSignature;
// utils.toAddress = toAddress;
// utils.sign = sign;
// utils.recover = recover;
// utils.recoverPublicKey = recoverPublicKey;
utils.getDerivedKey = getDerivedKey;
utils.encryptMessage = encryptMessage;
utils.decryptMessage = decryptMessage;
utils.toGrains = toGrains;
// utils.fromGrains = fromGrains;
utils.remove0x = remove0x;
utils.hexToAscii = hexToAscii;
utils.sleep = sleep;
utils.gzip = gzip;
utils.gunzip = gunzip;

export default utils;
