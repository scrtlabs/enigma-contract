const fs = require('fs');
module.exports = function(callback) {
  (async () => {
    const jsonFile = 'build/contracts/IEnigma.json';
    const parsed = JSON.parse(fs.readFileSync(jsonFile));
    const abi = parsed.abi;
    const address = '0xe547Baa852602c90e641d0e9d6B0d279AFC09f92';
    let Enigma = new web3.eth.Contract(abi, address);
    const blockNumber = await web3.eth.getBlockNumber();
    console.log('The current block number:', blockNumber);
    const accounts = await web3.eth.getAccounts();
    const result = await Enigma.methods.getActiveWorkers(blockNumber).call();
    console.log('The active workers:', result[0], result[1]);
    callback();
  })();
};
