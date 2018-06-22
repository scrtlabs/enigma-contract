const Preprocessor = {
    RAND: 'rand()',
};

class Task {
    constructor (callable, callableArgs, callback, preprocessors) {
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

    compute(fee) {

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
     */
    constructor(enigmaContract, dappContract) {
        this.contract = enigmaContract;
        this.dappContract = dappContract;
        this.workerParams = null;
    }


    getWorkersParams(blockNumber) {

    }

    prepareTask(blockNumber, callable, callableArgs, callback, preprocessors) {

        const workerParams = this.getWorkersParams(blockNumber);
        selectWorker(workerParams.seed, workerParams.workers);
        verifyWorker (data.worker[0], data.worker[2], data.worker[3], data.worker[4], data.worker[5]);
    }
}