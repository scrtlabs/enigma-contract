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
        if (typeof workerAddress === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else {
          callback(null, {
            workerEncryptionKey: '77bb5487c2ad4070dc130d4651583582ef1b58ecdbc4e74f5b8d685ec8fdfedf4db7d5be67dd409526b2bafb09a1dacad04816b72ad001d9df57c2d1c1f783a6',
            workerSig: '0xd1124de42eaf7ab1ae7ae3dc3b3bb18085f867e8cacd5ecccde653760dbcd9793c71427611a6cfdfef366f65a6770451cbf9f800b55aed83e70668d321a261001b',
            msgId: 'ldotj6nghv7a',
          });
        }
      },
      deploySecretContract: function(compiledBytecodeHash, encryptedEncodedArgs, userDeployENGSig, msgId, callback) {
        if (typeof compiledBytecodeHash === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof encryptedEncodedArgs === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof userDeployENGSig === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else {
          callback(null, {
            deploySentResult: true,
          });
        }
      },
      sendTaskInput: function(taskId, creationBlockNumber, sender, scAddr, encryptedFn, encryptedEncodedArgs,
                              userTaskSig, userPubKey, fee, msgId, callback) {
        if (typeof taskId === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof creationBlockNumber === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof sender === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof scAddr === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof encryptedFn === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof encryptedEncodedArgs === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof userTaskSig === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof userPubKey === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else if (typeof fee === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else {
          callback(null, {
            sendTaskResult: true,
          });
        }
      },
      pollTaskInput: function(taskId, callback) {
        if (typeof taskId === "undefined") {
          callback({"code": -32602, "message": "Invalid params"});
        } else {
          _counter++;
          let status = (_counter < 5) ? 1 : 2;
          callback(null, {
            taskId: '0xdd839d251b7b16d0f52bb05b0ab4290abe0e44dd0044b2627ec7e5ce21815667',
            encryptedEncodedOutputs: 'abcd1234',
            sig: 'mySig',
            status: status
          });
        }
      },
    }, {
      collect: false // don't collect params in a single argument
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
