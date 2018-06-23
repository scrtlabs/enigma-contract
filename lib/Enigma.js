const abi = require ('ethereumjs-abi');
const web3Utils = require ('web3-utils');
const engUtils = require ('./enigma-utils');

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
    constructor (taskId, blockNumber, dappContractAddress, callable, callableArgs, callback,
                 preprocessors, contract, tokenContract, account, worker) {
        this.taskId = taskId;
        this.blockNumber = blockNumber;
        this.dappContractAddress = dappContractAddress;
        this.callable = callable;
        this.callableArgs = callableArgs;
        this.callback = callback;
        this.preprocessors = preprocessors;
        this._contract = contract;
        this._tokenContract = tokenContract;
        this.account = account;
        this.fee = null;
        this._worker = worker;
    }

    checkWorkerVerified () {
        return this._worker.verified.verified;
    }

    getWorker () {
        return this._worker;
    }

    toJSON () {
        return JSON.stringify ({
            taskId: this.taskId,
            blockNumber: this.blockNumber.toNumber (),
            dappContractAddress: this.dappContractAddress,
            callable: this.callable,
            callableArgs: this.callableArgs,
            callback: this.callable,
            preprocessors: this.preprocessors,
            contract: this._contract.address,
            tokenContract: this._tokenContract.address,
            account: this.account,
            fee: this.fee && this.fee.toNumber (),
            worker: {
                signer: this._worker.signer,
                verified: this._worker.verified
            }
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
        if (!this._worker.verified.verified === true) {
            // Don't allow computations for an unverified worker
            return Promise.reject ('Cannot give out a task to ' + this._worker.signer +
                'because it failed verification: ' + this._worker.verified.err);
        }

        return this._tokenContract.balanceOf (this.account).then (balance => {
            if (balance <= fee) {
                throw new Error ('Not enough ENG tokens to approve the computation fee.');
            }
            return this._tokenContract.approve (this._contract.address, fee, { from: this.account })
                .then (result => {
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
        return this._tokenContract.allowance (this.account, this._contract.address)
            .then (allowance => {
                if (this.fee > allowance) {
                    throw new Error ('The computation fee has not been allowed yet');
                }
                return this._contract.compute (
                    this.dappContractAddress, this.callable, this.callableArgs,
                    this.callback, this.fee, this.preprocessors, this.blockNumber,
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
        this.workers = {};
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
                    blockNumber: result[0],
                    seed: result[1],
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
    _verify (blockNumber, taskId) {
        // TODO: consider adding 1 to the current block number
        return this._getWorkersParams (blockNumber)
            .then (workersParams => {
                const custodian = engUtils.selectWorker (workersParams.seed, taskId, workersParams.workers);
                if (custodian in this.workers) {
                    return this.workers[custodian];
                } else {
                    return this.contract.workers (custodian)
                        .then (worker => {
                            worker.verified = engUtils.verifyWorker (worker[0],
                                worker[2], worker[3], worker[4], worker[5]);
                            this.workers[custodian] = worker;
                            return worker;
                        });
                }
            })
            .then (worker => {
                if (worker.verified) {
                    return worker;
                } else {
                    throw new Error ('Worker verification failed.')
                }
            });
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
    createTask (_blockNumber, dappContractAddress, callable, _callableArgs, callback, account, _preprocessors) {
        let preprocessors;
        try {
            if (_preprocessors) {
                preprocessors = _preprocessors.map (p => web3Utils.utf8ToHex (p));
            }
        } catch (e) {
            return Promise.reject ('Invalid preprocessor: ' + e.message);
        }

        let callableArgs;
        try {
            callableArgs = engUtils.rlpEncode (_callableArgs);
        } catch (e) {
            return Promise.reject ('Unable to encode the callableArgs: ' + e.message);
        }

        let blockNumber;
        try {
            blockNumber = web3Utils.isBN (_blockNumber) ? _blockNumber : web3Utils.toBN (_blockNumber);
        } catch (e) {
            return Promise.reject ('Invalid block number: ' + e.message);
        }

        let taskId;
        try {
            taskId = engUtils.generateTaskId (dappContractAddress,
                callable, callableArgs, blockNumber);
        } catch (e) {
            return Promise.reject ('Unable to generate a taskId: ' + e.message);
        }

        if (!web3Utils.isAddress (dappContractAddress)) {
            return Promise.reject ('Invalid dappContractAddress');
        }

        if (!web3Utils.isAddress (account)) {
            return Promise.reject ('Invalid account address');
        }

        if (!engUtils.checkMethodSignature (callable)) {
            return Promise.reject ('Invalid callable method signature, should be: `baz(uint32,bool)`')
        }
        if (!engUtils.checkMethodSignature (callback)) {
            return Promise.reject ('Invalid callback method signature, should be: `baz(uint32,bool)`')
        }

        return this._verify (blockNumber, taskId).then (worker => {
            let task = new Task (taskId, blockNumber, dappContractAddress,
                callable, callableArgs, callback, preprocessors, this.contract,
                this.tokenContract, account, worker);
            return task;
        });
    }
}

exports.Enigma = Enigma;
exports.Task = Task;
exports.Preprocessor = Preprocessor;