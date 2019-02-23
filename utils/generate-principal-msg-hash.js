module.exports = function(callback) {
  (async () => {
    const epoch = {
      blockNumber: '1',
      workers: ['0xf25186B5081Ff5cE73482AD761DB0eB0d25abfBF'],
      stakes: ['1'],
      nonce: '0',
      seed: '0xd642b60122d2807382937cd6b5327ecc68ed310b665f371c22f228cbad60df1',
    };
    const msg = web3.eth.abi.encodeParameters(
        ['uint256', 'uint256', 'address[]', 'uint256[]'],
        [epoch.seed, epoch.nonce, epoch.workers, epoch.stakes],
    );
    const hash = web3.utils.keccak256(msg);
    console.log('The message hash:', hash);
    const hashPacked = web3.utils.soliditySha3(
        {t: 'uint', v: epoch.seed},
        {t: 'uint', v: epoch.nonce},
        {t: 'address[]', v: epoch.workers},
        {t: 'uint[]', v: epoch.stakes},
    );
    console.log('The message hash packed:', hashPacked);
    callback();
  })();
};
