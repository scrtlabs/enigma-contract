var jayson = require('jayson');
var cors = require('cors');
var connect = require('connect');
var jsonParser = require('body-parser').json;
var app = connect();

var server = jayson.server({
  getWorkerEncryptionKey: function(args, callback) {
    callback(null, ['0061d93b5412c0c99c3c7867db13c4e13e51292bd52565d002ecf845bb0cfd8adfa5459173364ea8aff3fe24054cca88581f6c3c5e928097b9d4d47fce12ae47', 'mySig']);
  },
  deploySecretContract: function(args, callback) {
    callback(null, ['successfully deployed']);
  },
  sendTaskInputs: function(args, callback) {
    callback(null, ['successfully sent task inputs']);
  },
});

app.use(cors({methods: ['POST']}));
app.use(jsonParser());
app.use(server.middleware());

app.listen(3000);
