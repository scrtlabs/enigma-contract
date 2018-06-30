const RLP = require ('rlp');
const abi = require ('ethereumjs-abi');
const engUtils = require ('../lib/enigma-utils');
const eng = require ('../lib/Enigma');
const data = require ('./data');
const testUtils = require ('./test-utils');

// This could use the injected web3Utils
// But I don't like injected things and this ensures compatibility
// with Truffle upgrades
const web3Utils = require ('web3-utils');

const GAS_PRICE_GWEI = '2'; // To estimate current gas price: https://ethgasstation.info/
const ENG_SUPPLY = 15000000000000000;

// console.log ('testing the enigma lib:', engUtils.test ());

const EnigmaContract = artifacts.require ("./contracts/Enigma.sol");
const EnigmaToken = artifacts.require ("./contracts/EnigmaToken.sol");
const CoinMixer = artifacts.require ("./contracts/CoinMixer.sol");

let gasTracker = new testUtils.GasTracker (web3, GAS_PRICE_GWEI);

// Initialize contract variables
let enigmaContract;
let tokenContract;
let coinMixerContract;
contract ('Enigma', accounts => {
    it ("...should register a new worker", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;

            let promises = [];
            for (let i = 0; i < accounts.length; i++) {
                let worker = (i === 9) ? data.principal : data.worker;
                if (i === 9) {
                    console.log('setting principal node', worker[0]);
                }
                const report = engUtils.encodeReport (
                    worker[1],
                    worker[2],
                    worker[3],
                );
                // Using the same artificial data for all workers
                let promise = enigmaContract.register (
                    worker[0], report,
                    {
                        from: accounts[i],
                        gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
                    }
                );
                promises.push (promise);
            }
            // Using the account as the signer for testing purposes
            return Promise.all (promises);
        }).then (results => {
            results.forEach ((result) => {
                event = result.logs[0];
                // console.log (event);
                assert.equal (event.args._success, true, "Worker registration failed.");
            });
            gasTracker.logGasUsed (results[0], 'register');
        }));

    it ("...should fetch worker details", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;

            return enigmaContract.workers (accounts[0], { from: accounts[0] });
        })
        .then (result => {
            assert.equal (result[0], data.worker[0], "No worker details.");
        }));

    const callable = data.callable;
    const callback = data.callback;
    const callableArgs = '0x' + RLP.encode (data.args).toString ('hex');
    let taskId;
    let blockNumber;
    it ("...should generate a taskId", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;
            return CoinMixer.deployed ();
        }).then (instance => {
            coinMixerContract = instance;
            return web3.eth.getBlockNumber ();
        })
        .then (_blockNumber => {
            blockNumber = _blockNumber;

            return enigmaContract.generateTaskId.call (coinMixerContract.address, callable, callableArgs, blockNumber, { from: accounts[0] })
        })
        .then (contractTaskId => {
            // TODO: add to enigma-js
            taskId = engUtils.generateTaskId (coinMixerContract.address, callable, callableArgs, blockNumber);
            // console.log ('the task id: ', contractTaskId, taskId);
            assert.equal (contractTaskId, taskId, 'Local hash does not match contract.')
        })
    );

    it ("...should execute a computation task", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;
            return EnigmaToken.deployed ();
        })
        .then (instance => {
            tokenContract = instance;
            return CoinMixer.deployed ();
        })
        .then (instance => {
            coinMixerContract = instance;
            return tokenContract.totalSupply ();
        })
        .then (supply => {
            assert.equal (supply, ENG_SUPPLY, 'Invalid ENG total supply.');

            return tokenContract.balanceOf (accounts[0]);
        })
        .then (balance => {
            assert.equal (balance, ENG_SUPPLY, 'Invalid account ENG balance.');
            return tokenContract.approve (enigmaContract.address, 1, { from: accounts[0] })
        })
        .then (result => {
            let event = result.logs[0];
            assert.equal (event.event, 'Approval', 'Approval failed.');

            return tokenContract.allowance (accounts[0], enigmaContract.address);
        })
        .then (allowance => {
            assert.equal (allowance, 1, "Incorrect allowance.");

            // RLP encoding arguments
            const preprocessor = [web3Utils.utf8ToHex ('rand()')];
            return enigmaContract.compute (
                coinMixerContract.address, callable, callableArgs, callback, 1, preprocessor, blockNumber,
                {
                    from: accounts[0],
                    gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
                }
            );
        }).then (result => {
            let event = result.logs[0];
            // console.log ('secret call event', event);

            assert.equal (event.args._success, true, "Unable to compute.");
            gasTracker.logGasUsed (result, 'compute');
        }));

    it ("...should query computation tasks", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;
            return CoinMixer.deployed ();
        })
        .then (instance => {
            coinMixerContract = instance;
            return enigmaContract.tasks (taskId, { from: accounts[0] });
        }).then (task => {
            assert.equal (task[0], coinMixerContract.address, "Task not found.");
        }));

    // Changing a character in one of the two results should break the validation
    const localResults = [
        0, [
            web3Utils.toChecksumAddress ('0x6330a553fc93768f612722bb8c2ec78ac90b3bbc'),
            web3Utils.toChecksumAddress ('0x5aeda56215b167893e80b4fe645ba6d5bab767de')
        ]
    ];
    const contractResults = [
        0, [
            web3Utils.toChecksumAddress ('0x6330a553fc93768f612722bb8c2ec78ac90b3bbc'),
            web3Utils.toChecksumAddress ('0x5aeda56215b167893e80b4fe645ba6d5bab767de')
        ]
    ];
    it ("...should commit the task results", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;

            return CoinMixer.deployed ();
        })
        .then (instance => {
            coinMixerContract = instance;


            const fName = callback.substr (0, callback.indexOf ('('));
            assert.equal (fName, 'distribute', 'Function name parsed incorrectly');

            const rx = /distribute\((.*)\)/g;
            const resultArgs = rx.exec (callback)[1].split (',');
            assert.equal (JSON.stringify (resultArgs), JSON.stringify (['uint32', 'address[]']));
            //
            const functionId = web3Utils.soliditySha3 ({
                t: 'string',
                v: callback
            }).slice (0, 10);
            const localData = functionId + abi.rawEncode (resultArgs, localResults).toString ('hex');

            return web3.eth.getCode (coinMixerContract.address).then ((bytecode) => {
                // The holy grail, behaves exactly as keccak256() in Solidity
                const hash = web3Utils.soliditySha3 (callableArgs, localData, bytecode);
                const contractData = functionId + abi.rawEncode (resultArgs, contractResults).toString ('hex');

                const sig = engUtils.sign (data.worker[4], hash);
                // Using an actual Ethereum address instead of a virtual address
                // This is testing the same thing
                // The python unit tests handle virtual addresses from private keys.
                return enigmaContract.commitResults (taskId, contractData, sig, blockNumber,
                    {
                        from: accounts[0],
                        gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
                    }
                );
            });

        })
        .then (result => {
            // console.log ('the commit results', result);
            let event1 = result.logs[0];
            // console.log ('the sig event:', JSON.stringify (event1));
            let event2 = result.logs[1];
            // console.log ('commit results event', JSON.stringify (event2));

            assert.equal (event1.args._success, true, 'Unable to verify hash.');
            assert.equal (event2.args._success, true, 'Unable to commit results.');
            gasTracker.logGasUsed (result, 'commitResults');
        }));

    let lastFiveWorkers = [];
    it ("...should set workers params", () => {
        return EnigmaContract.deployed ()
            .then (instance => {
                enigmaContract = instance;

                let promises = [];
                for (let i = 0; i < 10; i++) {
                    const seed = Math.floor (Math.random () * 100000);
                    const hash = web3Utils.soliditySha3 (
                        { t: 'uint256', v: seed }
                    );
                    const sig = engUtils.sign (data.principal[4], hash);
                    let promise = enigmaContract.setWorkersParams (seed, sig,
                        {
                            from: accounts[9],
                            gasPrice: web3Utils.toWei (GAS_PRICE_GWEI, 'gwei')
                        }
                    );
                    promises.push (promise);
                }
                return Promise.all (promises);
            }).then (results => {
                results.forEach ((result, i) => {
                    let event = result.logs[0];
                    assert.equal (event.args._success, true, 'Unable to parameterize workers.');
                    if (i > 4) {
                        lastFiveWorkers.push ({
                            seed: parseInt (event.args.seed),
                            blockNumber: event.blockNumber
                        });
                    }
                });
                gasTracker.logGasUsed (results[0], 'setWorkersParams');
            });
    });

    it ("...should fetch the worker params", () => {
        return EnigmaContract.deployed ()
            .then (instance => {
                enigmaContract = instance;

                let promises = [];
                lastFiveWorkers.forEach ((worker) => {
                    promises.push (enigmaContract.getWorkersParams (worker.blockNumber, { from: accounts[0] }));
                });
                return Promise.all (promises);
            })
            .then (results => {
                let workerParams = [];
                results.forEach ((result) => {
                    // console.log('the worker params', JSON.stringify(result))
                    workerParams.push ({
                        seed: parseInt (result[1]),
                        blockNumber: parseInt (result[0])
                    });
                });
                // console.log ('workers parameters', workerParams);
                assert.equal (JSON.stringify (lastFiveWorkers), JSON.stringify (workerParams), "worker params don't match calculated list");
            });
    });

    let selectedBlock;
    let selectedWorker;
    const workerIndex = Math.floor (Math.random () * 4);
    it ("...should select the worker " + workerIndex, () => {
        return EnigmaContract.deployed ()
            .then (instance => {
                enigmaContract = instance;

                selectedBlock = lastFiveWorkers[workerIndex].blockNumber;
                return enigmaContract.getWorkersParams (selectedBlock, { from: accounts[0] });
            })
            .then (result => {
                const workerParams = {
                    seed: result[1],
                    blockNumber: result[0],
                    workers: result[2].filter (addr => addr > 0)
                };

                // console.log ('worker params:', JSON.stringify (workerParams));
                selectedWorker = engUtils.selectWorker (workerParams.seed, taskId, workerParams.workers);
                // console.log ('the selected worker:', selectedWorker, workerParams.seed, workerParams.workers.length);
                return enigmaContract.selectWorker (selectedBlock, taskId, { from: accounts[0] });
            })
            .then (contractSelectedWorker => {

                // console.log ('the contract selected worker:', contractSelectedWorker);
                assert.equal (contractSelectedWorker, selectedWorker, "Selected worker does not match");
            });
    });

    it ("...should verify the worker's signature and certificate", () => {
        return EnigmaContract.deployed ()
            .then (instance => {
                enigmaContract = instance;

                return enigmaContract.getReport (accounts[0], { from: accounts[0] });
            })
            .then (result => {
                // console.log ('the report', JSON.stringify (result))
                const response = engUtils.verifyWorker (result[0], result[1]);
                assert (response.verified, "Verification failed");
            });

    });

    let enigma;
    it ("...should instantiate the Enigma class", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;
            return EnigmaToken.deployed ();
        })
        .then (instance => {
            tokenContract = instance;
            enigma = new eng.Enigma (enigmaContract, tokenContract);
            assert (true);
        })
    );

    const eng_fee = 1;
    it ("...should create a computation task from the enigma object", () => web3.eth.getBlockNumber ()
        .then (_blockNumber => {
            blockNumber = _blockNumber;
            // console.log ('the block number:', blockNumber);
            return CoinMixer.deployed ();
        })
        .then (coinMixer => {
            return enigma.createTask (blockNumber,
                coinMixer.address,
                data.callable,
                data.args,
                data.callback,
                eng_fee,
                [eng.Preprocessor.RAND]
            );
        })
        .then (task => {
            assert (task.checkWorkerVerified (), "Task not created");
        })
    );

    let task;
    /**
     * This is the full logic which a Dapp should implement to send a computation
     * task. I broke it down in 3 asynchronous steps:
     *
     * 1- Create the task, this automatically select the worker and verify its
     *    certificate. Users can check the verification results before
     *    paying or sending any data to the network.
     * 2- Approve the computation fee. The promise returns a Result object
     *    containing a transaction id. Users must wait for the tx to complete.
     *    To approve the fee for multiple tasks, use `Task::approveFeeBatch`.
     * 3- Give out the computation task. This calls the `compute` function
     *    of the Enigma contract. When the task is done, the Enigma contract
     *    will emit an event. //TODO: consider wrapping some kind of listener
     *
     */
    it.skip ("...should dispatch a computation task and pay a fee", () => web3.eth.getBlockNumber ()
        .then (_blockNumber => {
            // Can't send two tasks with the same id to the same block
            blockNumber = _blockNumber + 1;
            return CoinMixer.deployed ();
        })
        .then (coinMixer => {
            return enigma.createTask (blockNumber,
                coinMixer.address,
                data.callable,
                data.args,
                data.callback,
                eng_fee,
                [eng.Preprocessor.RAND]
            );
        })
        .then (_task => {
            task = _task;
            return task.approveFee ({ from: accounts[0] });
        })
        .then (result => {
            let event = result.logs[0];
            // console.log ('the result:', JSON.stringify (result));
            assert.equal (event.args.value, eng_fee, 'Unable to approve fee.');

            return task.compute ({ from: accounts[0] });
        })
        .then (result => {
            let event = result.logs[0];
            assert.equal (event.args._success, true, 'Unable to compute the task.');
        })
        .then (() => {
            gasTracker.displayStats ();
        })
    );
});
