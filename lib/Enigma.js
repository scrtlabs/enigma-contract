const abi = require ('ethereumjs-abi');
const web3Utils = require ('web3-utils');
const engUtils = require ('enigma-utils');

const Preprocessor = {
    RAND: 'rand()',
};

class Task {
    /**
     * Creates a stateful object representing a given computation task.
     *
     * @param dappContractAddress
     * @param callable
     * @param callableArgs
     * @param callback
     * @param preprocessors
     * @param contract
     * @param tokenContract
     * @param account
     */
    constructor (dappContractAddress, callable, callableArgs, callback, preprocessors, contract, tokenContract, account) {
        this.dappContractAddress = dappContractAddress;
        this.callable = callable;
        this.callableArgs = callableArgs;
        this.callback = callback;
        this.preprocessors = preprocessors;
        this.contract = contract;
        this.tokenContract = tokenContract;
        this.account = account;
        this.fee = null;

        this.nonce = engUtils.generateNonce ();
        this.taskId = engUtils.generateTaskId (this.dappContractAddress,
            this.callable, this.callableArgs, this.nonce);
    }

    /**
     * Check of the workerParams valid in cache is valid, if not fetch it from
     * the Enigma contract.
     *
     */
    _getWorkersParams (blockNumber) {
        // TODO: since the parameters only change every epoch, consider caching
        return this.contract.getWorkersParams (blockNumber)
            .then (result => { // Populate the cache with updated results
                return {
                    blockNumber: web3Utils.toBN (result[0]),
                    seed: web3Utils.toBN (result[1]),
                    workers: result[2].filter (addr => addr > 0)
                };
            });
    }

    /**
     * Verify the certificate and signature of the worker performing the task.
     *
     * @param blockNumber
     * @returns {*}
     */
    verify (blockNumber) {
        // TODO: consider adding 1 to the current block number
        return this._getWorkersParams (blockNumber)
            .then (workersParams => {
                const custodian = engUtils.selectWorker (workersParams.seed, workersParams.workers);
                return this.contract.workers (custodian, { from: account });
            })
            .then (worker => {
                return engUtils.verifyWorker (worker[0], worker[2], worker[3], worker[4], worker[5]);
            });
    }

    /**
     * Approve the ENG computation fee.
     *
     * @param account
     * @param fee
     * @returns {*}
     */
    approveFee (fee) {
        return this.tokenContract.balanceOf (this.account).then (balance => {
            if (balance <= fee) {
                throw new Error ('Not enough ENG tokens to approve the computation fee.');
            }
            return this.tokenContract.approve (this.contract.address, fee, { from: this.account })
                .then ((result) => {
                    this.fee = fee;
                    return result;
                });
        });
    }

    /**
     * Give out the computation task
     * @param fee
     * @returns {*}
     */
    compute () {
        if (!this.fee) {
            return Promise.reject ('Please call `approveFee` of this task to set and approve the computation fee.');
        }
        const preprocessors = [web3Utils.utf8ToHex (this.preprocessors)];
        return this.tokenContract.allowance (this.account, this.contract.address)
            .then (allowance => {
                if (this.fee > allowance) {
                    throw new Error ('The computation fee has not been allowed yet');
                }
                return this.contract.compute (
                    this.dappContractAddress, this.callable, this.callableArgs,
                    this.callback, this.fee, preprocessors, this.nonce,
                    { from: this.account }
                );
            });
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
     * @param contract
     * @param tokenContract
     * @param account
     */
    constructor (contract, tokenContract) {
        this.contract = contract;
        this.tokenContract = tokenContract;
    }

    /**
     * Create a computation task object
     *
     * @param blockNumber
     * @param dappContractAddress
     * @param callable
     * @param callableArgs
     * @param callback
     * @param preprocessors
     * @param account
     * @returns {*}
     */
    createTask (dappContractAddress, callable, callableArgs, callback, preprocessors, account) {
        let task = new Task (dappContractAddress, callable, callableArgs,
            callback, preprocessors, this.contract, this.tokenContract, account);
        return task;
    }
}