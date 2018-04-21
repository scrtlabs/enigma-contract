class Enigma {
    // TODO: add constructions which find the contract
    constructor (deployedContract) {
        this.contract = deployedContract;
    }

    estimateEngFee (callObject) {
        // Estimates the ENG fee for the computation
        // Estimating should use the `estimateGas` function of Ethereum +
        // the mean of the latest few transactions to suggest a rate
        // TODO: include business logic
        return 1;
    }

    compute (callObject, options) {
        // Calls the compute function of the Engima contract
        // See diagram for details: doc/poc-compute-sequence.png
        return this.contract.compute (callObject.secretContract,
            callObject.callable, callObject.args, callObject.callback, options)
            .then ((result) => {
                let event = null;
                for (let i = 0; i < result.logs.length; i++) {
                    let log = result.logs[i];

                    if (log.event == 'ComputeTask') {
                        // We found the event!
                        console.log ('computation task created', log);
                        event = log;
                        break;
                    }
                }
                if (!event) {
                    throw 'ComputeTask event not found.'
                }
                return event;
            });
    }

    encrypt (args, options) {
        // Encrypt the specified arguments
        // See diagram for details: doc/get_public_key_sequence.png
        return args;
    }
}

export default Enigma;
