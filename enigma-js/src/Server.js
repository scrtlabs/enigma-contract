import jayson from 'jayson';
import cors from 'cors';
import connect from 'connect';
import bodyParser from 'body-parser';
import web3Utils from 'web3-utils';
import data from '../test/data';
import EthCrypto from 'eth-crypto';
import msgpack from 'msgpack-lite';
import utils from './enigma-utils';


export default class RPCServer {
  constructor() {
    let _counter = 0;
    this.app = connect();
    this.serverInstance = null;
    this.resetCounter = () => {
      _counter = 0;
    };
    this.server = jayson.server({
      getWorkerEncryptionKey: function(workerAddress, callback) {
        if (!workerAddress) {
          callback({code: -32602, message: 'Invalid params'});
        } else {
          const identity = EthCrypto.createIdentity();
          let key = [];
          for (let n = 0; n < identity.publicKey.length; n += 2) {
            key.push(parseInt(identity.publicKey.substr(n, 2), 16));
          }
          const prefix = 'Enigma User Message'.split('').map(function(c) {
            return c.charCodeAt(0);
          });
          const buffer = msgpack.encode({'prefix': prefix, 'pubkey': key});
          const signature = EthCrypto.sign(data.worker[4], web3Utils.soliditySha3({t: 'bytes', value: buffer.toString('hex')}));
          callback(null, {
            result: {
              workerEncryptionKey: identity.publicKey,
              workerSig: utils.remove0x(signature),
            }, id: 'ldotj6nghv7a',
          });
        }
      },
      deploySecretContract: function(preCode, encryptedArgs, encryptedFn, userDHKey, contractAddress, callback) {
        if (!preCode) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!encryptedArgs) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!encryptedFn) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!userDHKey) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!contractAddress) {
          callback({code: -32602, message: 'Invalid params'});
        } else {
          callback(null, {
            deploySentResult: true,
          });
        }
      },
      sendTaskInput: function(taskId, workerAddress, encryptedFn, encryptedArgs, contractAddress, userDHKey, callback) {
        if (!taskId) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!workerAddress) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!encryptedFn) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!encryptedArgs) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!contractAddress) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!userDHKey) {
          callback({code: -32602, message: 'Invalid params'});
        } else {
          callback(null, {
            sendTaskResult: true,
          });
        }
      },
      getTaskStatus: function(taskId, workerAddress, withResult, callback) {
        if (!taskId) {
          callback({code: -32602, message: 'Invalid params'});
        } else if (!workerAddress) {
          callback({code: -32602, message: 'Invalid params'});
        } else {
          _counter++;
          let status = (_counter < 5) ? 'INPROGRESS' : 'SUCCESS';
          callback(null, {
            result: {
              output: [22, 22, 22, 22, 22, 33, 44, 44, 44, 44, 44, 44, 44, 55, 66, 77, 88, 99],
              status: status,
            },
          });
        }
      },
      getTaskResult: function(taskId, callback) {
        if (!taskId) {
          callback({code: -32602, message: 'Invalid params'});
        } else {
          switch (_counter) {
            case (0):
              _counter++;
              callback(null, {
                result: {
                  status: 'INVALIDSTATUS',
                },
              });
              break;
            case (1):
              _counter++;
              callback(null, {
                result: {
                  status: 'null',
                },
              });
              break;
            case (2):
              _counter++;
              callback(null, {
                result: {
                  status: 'UNVERIFIED',
                },
              });
              break;
            case (3):
              _counter++;
              callback(null, {
                result: {
                  status: 'INPROGRESS',
                },
              });
              break;
            case (4):
              _counter++;
              callback(null, {
                result: {
                  taskId: '0x0033105ed3302282dddd38fcc8330a6448f6ae16bbcb26209d8740e8b3d28538',
                  status: 'FAILED',
                  output: [22, 22, 22, 22, 22, 33, 44, 44, 44, 44, 44, 44, 44, 55, 66, 77, 88, 99],
                  usedGas: 'amount-of-gas-used',
                  signature: 'enclave-signature',
                },
              });
              break;
            default:
              _counter++;
              callback(null, {
                result: {
                  taskId: '0x0033105ed3302282dddd38fcc8330a6448f6ae16bbcb26209d8740e8b3d28538',
                  status: 'SUCCESS',
                  output: [22, 22, 22, 22, 22, 33, 44, 44, 44, 44, 44, 44, 44, 55, 66, 77, 88, 99],
                  delta: {'key': 0, 'data': [11, 2, 3, 5, 41, 44]},
                  usedGas: 'amount-of-gas-used',
                  ethereumPayload: 'hex of payload',
                  ethereumAddress: 'address of the payload',
                  signature: 'enclave-signature',
                },
              });
          }
        }
      },
    }, {
      collect: false, // don't collect params in a single argument
    });
  }

  listen() {
    this.app.use(cors({methods: ['POST']}));
    this.app.use(bodyParser.json());
    this.app.use(this.server.middleware());
    this.serverInstance = this.app.listen(3000);
  }

  close(done) {
    this.serverInstance.close(done);
  }
}
