module.exports = function(callback) {
  const RECEIPT_HASH = '0x33c3c14e3cd8764911d243e67c229adf7279b3e920a3dbb317ff989946ad47bb';
  const replacer = (name, val) => {
    if (web3.utils.isBN(val) || typeof val === 'number' || typeof val === 'boolean') {
      return web3.utils.toHex(val);
    } else if (val === 0 || val === '0') {
      return '0x0';
    } else if (val === null || val === undefined) {
      if (name === 'contractAddress') {
        // TODO: why empty in Truffle
        return web3.utils.toChecksumAddress('0xc1912fee45d61c87cc5ea59dae31190fffff2323');
      } else {
        return '0x';
      }
    } else {
      return val; // return as is
    }
  };

  (async () => {
    const receipt = await web3.eth.getTransactionReceipt(RECEIPT_HASH);
    const receiptJson = JSON.stringify(receipt, replacer);
    console.log('RECEIPT:', receiptJson);
    const blockHash = receipt.blockHash;
    const block = await web3.eth.getBlock(blockHash);
    const blockJson = JSON.stringify(block, replacer);
    console.log('BLOCK:', blockJson);
    callback();
  })();
};
