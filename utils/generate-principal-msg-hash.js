module.exports = function(callback) {
  (async () => {
    const epoch = {
      blockNumber: '10240',
      workers: [
        '0x627306090abab3a6e1400e9345bc60c78a8bef57',
        '0xf17f52151ebef6c7334fad080c5704d77216b732',
        '0xc5fdf4076b8f3a5357c5e395ab970b5b54098fef',
        '0x821aea9a577a9b44299b9c15c88cf3087f3b5544',
        '0x0d1d4e623d10f9fba5db95830f7d3839406c6af2',
        '0x2932b7a2355d6fecc4b5c0b6bd44cc31df247a2e',
        '0x2191ef87e392377ec08e7c08eb105ef5448eced5'],
      stakes: ['90000000000', '10000000000', '1000000000', '2000000000', '10000000000', '20000000000', '4000000000'],
      nonce: '0',
      seed: '50988235200444173608949792536820041636604916839545064578578833583764434511969',
    };
    const msg = web3.eth.abi.encodeParameters(
        ['uint256', 'uint256', 'address[]', 'uint256[]'],
        [epoch.seed, epoch.nonce, epoch.workers, epoch.stakes],
    );
    const hash = web3.utils.keccak256(msg);
    console.log('The message hash:', hash);
    const fromEnclave = 'a7ea85fbd69ef19b047e117761265d5ea3802482d947db60772c15d2ca502c45';
    console.log('The message hash from the enclave', fromEnclave);
    callback();
  })();
};
