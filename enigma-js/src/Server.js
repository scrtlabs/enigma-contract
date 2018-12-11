var jayson = require('jayson');
var cors = require('cors');
var connect = require('connect');
var jsonParser = require('body-parser').json;
var app = connect();

let counter = 0;
var server = jayson.server({
  getWorkerEncryptionKey: function(workerAddress, callback) {
    callback(null, {
      workerEncryptionKey: '0061d93b5412c0c99c3c7867db13c4e13e51292bd52565d002ecf845bb0cfd8adfa5459173364ea8aff3fe24054cca88581f6c3c5e928097b9d4d47fce12ae47',
      workerSig: 'mySig'
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
