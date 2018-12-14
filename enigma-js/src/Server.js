var jayson = require('jayson');
var cors = require('cors');
var connect = require('connect');
var jsonParser = require('body-parser').json;
var app = connect();

let counter = 0;
var server = jayson.server({
  getWorkerEncryptionKey: function(workerAddress, callback) {
    callback(null, {
      workerEncryptionKey: '77bb5487c2ad4070dc130d4651583582ef1b58ecdbc4e74f5b8d685ec8fdfedf4db7d5be67dd409526b2bafb09a1dacad04816b72ad001d9df57c2d1c1f783a6',
      workerSig: '0xd1124de42eaf7ab1ae7ae3dc3b3bb18085f867e8cacd5ecccde653760dbcd9793c71427611a6cfdfef366f65a6770451cbf9f800b55aed83e70668d321a261001b'
    });
  },
  deploySecretContract: function(compiledBytecodeHash, encryptedEncodedArgs, userDeployENGSig, callback) {
    callback(null, {
      deploySentResult: true,
    });
  },
  sendTaskInput: function(taskId, creationBlockNumber, sender, scAddr, encryptedFn, encryptedEncodedArgs, userTaskSig,
                          userPubKey, fee, callback) {
    callback(null, {
      sendTaskResult: true,
    });
  },
  pollTaskInput: function(taskId, callback) {
    counter++;
    let status = (counter < 5) ? 1 : 2;
    callback(null, {
      taskId: '0xdd839d251b7b16d0f52bb05b0ab4290abe0e44dd0044b2627ec7e5ce21815667',
      encryptedEncodedOutputs: 'abcd1234',
      sig: 'mySig',
      status: status
    });
  },
}, {
  collect: false // don't collect params in a single argument
});

app.use(cors({methods: ['POST']}));
app.use(jsonParser());
app.use(server.middleware());

app.listen(3000);
