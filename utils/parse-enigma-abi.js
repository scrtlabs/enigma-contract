const fs = require('fs');
module.exports = function(callback) {
  (async () => {
    const jsonFile = 'build/contracts/Enigma.json';
    const parsed = JSON.parse(fs.readFileSync(jsonFile));
    const abi = parsed.abi;
    const address = '0x729f735f69B679475edf684C14435e59D23a98e8';
    let Enigma = new web3.eth.Contract(abi, address);
    console.log('Got contract object from abi:', Enigma);
    callback();
  })();
};
