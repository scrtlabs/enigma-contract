const web3Utils = require ('web3-utils');
const engUtils = require ('./enigma-utils');
const RLP = require ('rlp');

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
     */
    constructor (taskId, blockNumber, dappContractAddress, callable, callableArgs, callback,
                 preprocessors, contract, tokenContract, fee, worker) {
        this.taskId = taskId;
        this.blockNumber = blockNumber;
        this.dappContractAddress = dappContractAddress;
        this.callable = callable;
        this.callableArgs = callableArgs;
        this.callback = callback;
        this.preprocessors = preprocessors;
        this._contract = contract;
        this._tokenContract = tokenContract;
        this.fee = fee;
        this._worker = worker;
    }

    /**
     * Checks of the worker has successfully passed the verification process.
     * Use as a guard before committing payment or data.
     *
     * @returns {*|boolean}
     */
    checkWorkerVerified () {
        return this._worker.verified.verified;
    }

    /**
     * Returns an object with the attributes of the selected worker
     * @returns {*}
     */
    getWorker () {
        return this._worker;
    }

    /**
     * A JSON serialization of the key attributes optimized for readability
     *
     * @returns {string}
     */
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
            fee: this.fee.toNumber (),
            worker: {
                signer: this._worker.signer,
                verified: this._worker.verified
            }
        });
    }

    /**
     * Approve the ENG computation fee.
     *
     * @returns {Promise<Result>}
     */
    approveFee (options) {
        if (options && !web3Utils.isAddress(options.from)) {
            return Promise.reject('Missing account option');
        }

        if (!this.checkWorkerVerified ()) {
            // Don't allow computations for an unverified worker
            return Promise.reject ('Cannot continue with task ' + this._worker.signer +
                ' because it failed verification: ' + this._worker.verified.err);
        }
        return Task.approveFee (this._tokenContract, this._contract, this.fee, options);
    }

    /**
     * Approve the specified fee
     *
     * @param tokenContract
     * @param contract
     * @param fee
     * @returns {*}
     */
    static approveFee (tokenContract, contract,  fee, options) {
        return tokenContract.balanceOf (options.from).then (balance => {
            if (balance <= fee) {
                throw new Error ('Not enough ENG tokens to approve the computation fee.');
            }
            return tokenContract.approve (contract.address, fee.toNumber(), options);
        });
    }

    /**
     * Approve the fees for a batch of tasks with a single transaction
     * @param tasks
     * @returns {*}
     */
    static approveFeeBatch (tasks, options) {
        if (options && !web3Utils.isAddress(options.from)) {
            return Promise.reject('Missing account option');
        }

        let promise = null;
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (!task.checkWorkerVerified ()) {
                // Don't allow computations for an unverified worker
                promise = Promise.reject ('Cannot continue with task ' + task._worker.signer +
                    'because it failed verification: ' + task._worker.verified.err);
                break;
            }
        }

        if (promise === null) {
            let fee = 0;
            tasks.forEach (task => {
                fee += task.fee;
            });
            return Task.approveFee (tasks[0]._tokenContract, tasks[0]._contract, fee, options);
        } else {
            return promise;
        }
    }

    /**
     * Give out the computation task
     * @returns {*}
     */
    compute (options) {
        if (options && !web3Utils.isAddress(options.from)) {
            return Promise.reject('Missing account option');
        }
        if (!this.checkWorkerVerified ()) {
            // Don't allow computations for an unverified worker
            return Promise.reject ('Cannot continue with task ' + this._worker.signer +
                'because it failed verification: ' + this._worker.verified.err);
        }
        return this._tokenContract.allowance (options.from, this._contract.address)
            .then (allowance => {
                if (this.fee > allowance) {
                    throw new Error ('The computation fee has not been allowed yet');
                }
                return this._contract.compute (
                    this.dappContractAddress, this.callable, this.callableArgs,
                    this.callback, this.fee.toNumber(), this.preprocessors, this.blockNumber.toNumber(),
                    options
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
        return this.contract.getWorkersParams (blockNumber.toNumber())
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
     * @param taskId
     * @returns {*}
     */
    _verify (blockNumber, taskId) {
        // TODO: consider adding 1 to the current block number
        let custodian;
        return this._getWorkersParams (blockNumber)
            .then (workersParams => {
                custodian = engUtils.selectWorker (workersParams.seed, taskId, workersParams.workers);
                if (custodian in this.workers) {
                    return Promise.resolve (this.workers[custodian]);
                } else {
                    return this.contract.getReport (custodian);
                }
            })
            .then (worker => {
                worker.verified = engUtils.verifyWorker (worker[0], worker[1]);
                this.workers[custodian] = worker;
                return worker;
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
     * @returns {*}
     */
    createTask (blockNumber, dappContractAddress, callable, callableArgs, callback, fee, preprocessors) {
        let _preprocessors;
        try {
            if (preprocessors) {
                _preprocessors = preprocessors.map (p => web3Utils.utf8ToHex (p));
            }
        } catch (e) {
            return Promise.reject ('Invalid preprocessor: ' + e.message);
        }

        let _callableArgs;
        try {
            _callableArgs = '0x' + RLP.encode (callableArgs).toString ('hex');
        } catch (e) {
            return Promise.reject ('Unable to encode the callableArgs: ' + e.message);
        }

        let _blockNumber;
        try {
            _blockNumber = web3Utils.isBN (blockNumber) ? blockNumber : web3Utils.toBN (blockNumber);
        } catch (e) {
            return Promise.reject ('Invalid block number: ' + e.message);
        }

        let _fee;
        try {
            _fee = web3Utils.isBN (fee) ? fee : web3Utils.toBN (fee);
        } catch (e) {
            return Promise.reject ('Invalid fee: ' + e.message);
        }

        let taskId;
        try {
            taskId = engUtils.generateTaskId (dappContractAddress,
                callable, _callableArgs, _blockNumber);
        } catch (e) {
            return Promise.reject ('Unable to generate a taskId: ' + e.message);
        }

        if (!web3Utils.isAddress (dappContractAddress)) {
            return Promise.reject ('Invalid dappContractAddress');
        }

        if (!engUtils.checkMethodSignature (callable)) {
            return Promise.reject ('Invalid callable method signature, should be: `baz(uint32,bool)`')
        }
        if (!engUtils.checkMethodSignature (callback)) {
            return Promise.reject ('Invalid callback method signature, should be: `baz(uint32,bool)`')
        }

        return this._verify (_blockNumber, taskId).then (worker => {
            let task = new Task (taskId, _blockNumber, dappContractAddress,
                callable, _callableArgs, callback, _preprocessors, this.contract,
                this.tokenContract,  _fee, worker);
            return task;
        });
    }
}

exports.Enigma = Enigma;
exports.Task = Task;
exports.Preprocessor = Preprocessor;