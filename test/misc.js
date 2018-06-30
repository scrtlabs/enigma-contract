const web3Utils = require ('web3-utils');
const abi = require ('ethereumjs-abi');

it.skip ("...testing simple abi encoding", () => {
    // Following the first example documented here: https://solidity.readthedocs.io/en/develop/abi-spec.html
    const functionDef = 'baz(uint32,bool)';
    const rx = /baz\((.*)\)/g;
    const args = rx.exec (functionDef)[1].split (',');
    const functionId = web3Utils.soliditySha3 (functionDef).slice (0, 10);
    const arg1 = abi.rawEncode ([args[0]], [69]).toString ("hex");
    const arg2 = abi.rawEncode ([args[1]], [true]).toString ("hex");
    const hash = functionId + arg1 + arg2;

    console.log ('the function id', functionId, arg1, arg2);

    assert.equal (hash, '0xcdcd77c000000000000000000000000000000000000000000000000000000000000000450000000000000000000000000000000000000000000000000000000000000001');
});

it.skip ("...testing dynamic encoding", () => {
    // Following the last example documented here: https://solidity.readthedocs.io/en/develop/abi-spec.html
    const functionDef = 'f(uint256,uint32[],bytes10,bytes)';
    const rx = /f\((.*)\)/g;
    const resultArgs = rx.exec (functionDef)[1].split (',');

    console.log ('the args', resultArgs);
    const functionId = web3Utils.soliditySha3 (functionDef).slice (0, 10);
    const encoded = abi.rawEncode ([resultArgs[0], resultArgs[1], resultArgs[2], resultArgs[3]], [0x123, [0x456, 0x789], "1234567890", "Hello, world!"]).toString ("hex");
    const hash = functionId + encoded;

    console.log ('dynamic encoding parts', functionId, encoded);

    assert.equal (hash, '0x8be65246' +
        '0000000000000000000000000000000000000000000000000000000000000123' +
        '0000000000000000000000000000000000000000000000000000000000000080' +
        '3132333435363738393000000000000000000000000000000000000000000000' +
        '00000000000000000000000000000000000000000000000000000000000000e0' +
        '0000000000000000000000000000000000000000000000000000000000000002' +
        '0000000000000000000000000000000000000000000000000000000000000456' +
        '0000000000000000000000000000000000000000000000000000000000000789' +
        '000000000000000000000000000000000000000000000000000000000000000d' +
        '48656c6c6f2c20776f726c642100000000000000000000000000000000000000');
});
