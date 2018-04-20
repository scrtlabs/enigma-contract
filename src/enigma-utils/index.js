import elliptic from 'elliptic';
import sjcl from 'sjcl';
import hkdf from './hkdf';

var ec = elliptic.ec ('secp256k1')

function getDerivedKey (enclavePublicKey, clientPrivateKey) {
    var epkey = ec.keyFromPublic (enclavePublicKey, 'hex');
    var key = ec.keyFromPrivate (clientPrivateKey, 'hex');
    var shared = key.derive (epkey.getPublic ());
    var ikm = sjcl.codec.hex.toBits (shared.toString (16))
    var salt = sjcl.codec.utf8String.toBits ("enigma");
    var info = sjcl.codec.utf8String.toBits ("handshake data");

    return sjcl.codec.hex.fromBits (hkdf (ikm, info, salt, 32));
}

function encryptMessage (derivedKey, msg) {
    var dkey = sjcl.codec.hex.toBits (derivedKey);
    var prp = new sjcl.cipher.aes (dkey)
    var iv = sjcl.random.randomWords (4)
    var cipher = sjcl.mode.gcm.encrypt (prp, sjcl.codec.utf8String.toBits (msg), iv)

    return [sjcl.codec.hex.fromBits (cipher), sjcl.codec.hex.fromBits (iv)]
}

function getPublicKey (clientPrivateKey) {
    var key = ec.keyFromPrivate (clientPrivateKey, 'hex');

    return key.getPublic ('hex');
}

export {getPublicKey, encryptMessage, getDerivedKey};

