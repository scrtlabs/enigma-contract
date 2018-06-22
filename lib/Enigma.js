const abi = require ('ethereumjs-abi');
const web3Utils = require ('web3-utils');

const Preprocessor = {
    RAND: 'rand()',
};

class Task {
    constructor (dappContractAddress, callable, callableArgs, callback, preprocessors) {
        this.dappContractAddress = dappContractAddress;
        this.callable = callable;
        this.callableArgs = callableArgs;
        this.callback = callback;
        this.preprocessors = preprocessors;
        this.taskId = null;
    }

    generateTaskId() {

        const arg = abi.rawEncode (['string'], ['test']).toString ("hex");
        taskId = generateTaskId ('0x627306090abab3a6e1400e9345bc60c78a8bef57', 'b', arg, 1);
    }

    approveFee(account, fee) {

    }

    compute(account, fee) {
        const preprocessor = [web3Utils.utf8ToHex ('rand()')];
        return enigma.compute (
            coinMixer.address, callable, callableArgs, callback, 1, preprocessor, nonce,
            { from: accounts[0] }
        );
    }
}

class Enigma {
    /**
     * Instantiate with a Truffle Contract representation of the deployed
     * Enigma contract.
     *
     * Enigma.deployed()...
     * Details here: https://github.com/trufflesuite/truffle/tree/next/packages/truffle-contract
     *
     * @param enigmaContract
     * @param engTokenContract
     * @param dappContract
     */
    constructor(enigmaContract, engTokenContract) {
        this.contract = enigmaContract;
        this.engTokenContract = engTokenContract;
        this.workerParams = null;
    }


    getWorkersParams(blockNumber) {

    }

    prepareTask(blockNumber, dappContractAddress, callable, callableArgs, callback, preprocessors) {
        let task = new Task(dappContractAddress,callable,callableArgs,callback,preprocessors);
        const workerParams = this.getWorkersParams(blockNumber);
        selectWorker(workerParams.seed, workerParams.workers);
        verifyWorker (data.worker[0], data.worker[2], data.worker[3], data.worker[4], data.worker[5]);
    }
}