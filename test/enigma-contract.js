const RLP = require ('rlp');
const abi = require ('ethereumjs-abi');
const engUtils = require ('../lib/enigma-utils');
const eng = require ('../lib/Enigma');
const data = require ('./data');

// This could use the injected web3Utils
// But I don't like injected things and this ensures compatibility
// with Truffle upgrades
const web3Utils = require ('web3-utils');

const ENG_SUPPLY = 15000000000000000;

console.log ('testing the enigma lib:', engUtils.test ());

const EnigmaContract = artifacts.require ("./contracts/Enigma.sol");
const EnigmaToken = artifacts.require ("./contracts/EnigmaToken.sol");
const CoinMixer = artifacts.require ("./contracts/CoinMixer.sol");

// Initialize contract variables
let enigmaContract;
let tokenContract;
let coinMixerContract;
contract ('Enigma standalone', accounts => {
    it ("... should register a new worker", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;

            let promises = [];
            for (let i = 0; i < accounts.length; i++) {
                const reportArgs = [
                    data.worker[2],
                    data.worker[3],
                    data.worker[4],
                    data.worker[5]
                ];
                const report = engUtils.rlpEncode (reportArgs);
                const quote = engUtils.rlpEncode (data.worker[1]);
                // Using the same artificial data for all workers
                let promise = enigmaContract.register (accounts[0], quote, report, { from: accounts[i] });

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
        }));

    it ("...should fetch worker details", () => EnigmaContract.deployed ()
        .then (instance => {
            enigmaContract = instance;

            return enigmaContract.workers (accounts[0], { from: accounts[0] });
        })
        .then (result => {
            // console.log ('my worker details', result);
            assert.equal (result[0], accounts[0], "No worker details.");
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
                { from: accounts[0] }
            );
        }).then (result => {
            let event = result.logs[0];
            // console.log ('secret call event', event);

            assert.equal (event.args._success, true, "Unable to compute.");
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

                // Using an actual Ethereum address instead of a virtual address
                // This is testing the same thing
                // The python unit tests handle virtual addresses from private keys.
                return web3.eth.sign (hash, accounts[0]).then ((sig) => {
                    return enigmaContract.commitResults (taskId, contractData, sig, { from: accounts[0] });
                });
            });

        })
        .then (result => {
            // console.log ('the commit results', result);
            let event1 = result.logs[0];
            let event2 = result.logs[1];
            // console.log ('commit results event', event2);

            assert.equal (event1.args._success, true, 'Unable to verify hash.');
            assert.equal (event2.args._success, true, 'Unable to commit results.');
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
                    let promise = web3.eth.sign (hash, accounts[0]).then ((sig) => {
                        return enigmaContract.setWorkersParams (seed, sig, { from: accounts[0] });
                    });
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
                // console.log ('last five workers', JSON.stringify (lastFiveWorkers));
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

    it ("...should create a computation task from the enigma object", () => web3.eth.getBlockNumber ()
        .then (_blockNumber => {
            blockNumber = _blockNumber;
            return CoinMixer.deployed ();
        })
        .then (coinMixer => {
            console.log('the block number: ', blockNumber, web3Utils.toBN(blockNumber));
            return enigma.createTask (blockNumber,
                coinMixer.address,
                data.callable,
                data.args,
                data.callback,
                accounts[0],
                [eng.Preprocessor.RAND]
            );
        })
        .then (task => {
            console.log('the computation task', task.toJSON());
            assert (task.checkWorkerVerified(), "Task not created");
        })
    );
});
