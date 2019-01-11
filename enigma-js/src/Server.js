import jayson from 'jayson';
import cors from 'cors';
import connect from 'connect';
import bodyParser from 'body-parser';
// var app = connect();


export default class RPCServer {

  constructor() {

    var _counter = 0;
    this.app = connect();
    this.serverInstance = null;
    this.server = jayson.server({
      getWorkerEncryptionKey: function(workerAddress, callback) {
        if (!workerAddress) {
          callback({"code": -32602, "message": "Invalid params"});
        } else {
          callback(null, {
            workerEncryptionKey: '77bb5487c2ad4070dc130d4651583582ef1b58ecdbc4e74f5b8d685ec8fdfedf4db7d5be67dd409526b2bafb09a1dacad04816b72ad001d9df57c2d1c1f783a6',
            workerSig: '0xd1124de42eaf7ab1ae7ae3dc3b3bb18085f867e8cacd5ecccde653760dbcd9793c71427611a6cfdfef366f65a6770451cbf9f800b55aed83e70668d321a261001b',
            msgId: 'ldotj6nghv7a',
          });
        }
      },
      sendTaskInput: function(taskId, creationBlockNumber, sender, scAddr, encryptedFn, encryptedAbiEncodedArgs,
                              userTaskSig, userPubKey, gasLimit, gasPx, msgId, callback) {
        if (!taskId) {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (!creationBlockNumber) {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (!sender) {
          callback({"code": -32602, "message": "Invalid params"});
        // } else if (!scAddr) {
        //   callback({"code": -32602, "message": "Invalid params"});
        } else if (!encryptedFn) {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (!encryptedAbiEncodedArgs) {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (!userTaskSig) {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (!userPubKey) {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (!gasLimit) {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (!gasPx) {
          callback({"code": -32602, "message": "Invalid params"});
        } else {
          callback(null, {
            sendTaskResult: true,
          });
        }
      },
      pollTaskInput: function(taskId, callback) {
        if (!taskId) {
          callback({"code": -32602, "message": "Invalid params"});
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
