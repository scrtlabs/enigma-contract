import jayson from 'jayson';
import cors from 'cors';
import connect from 'connect';
import bodyParser from 'body-parser';
import * as data from './data';
import EthCrypto from 'eth-crypto';
import web3Utils from 'web3-utils';
// var app = connect();

export default class RPCServer {
  constructor() {
    let _counter = 0;
    this.app = connect();
    this.serverInstance = null;
    this.server = jayson.server({
      getWorkerEncryptionKey: function(workerAddress, callback) {
        if (!workerAddress) {
          callback({code: -32602, message: 'Invalid params'});
        } else {
          const worker = data.workers.find((w) => w[0] === '0x' + workerAddress);
          console.log('Found worker', worker);
          const key = '0xc647c3b37429e43638712f2fc2ecfa3e0fbd1bc23938cb8e605a0e91bb93c9c184dbb06552ac9e' +
            'b7fb65f219bef58f14b90557299fc69b20331f60d183e98cc5';
          const sig = EthCrypto.sign(worker[4], key);
          callback(null, {
            result: {
              workerEncryptionKey: key,
              workerSig: sig,
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
      pollTaskInput: function(taskId, callback) {
        if (!taskId) {
          callback({code: -32602, message: 'Invalid params'});
        } else {
          _counter++;
          let status = (_counter < 5) ? 1 : 2;
          callback(null, {
            encryptedAbiEncodedOutputs: 'abcd1234',
            workerTaskSig: 'myWorkerSig',
            engStatus: status,
          });
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
