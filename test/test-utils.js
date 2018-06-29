const web3Utils = require ('web3-utils');


class GasTracker {
    constructor (web3, gasPrice) {
        this.web3 = web3;
        this.gasUsed = [];
        this.gasPrice = gasPrice;
    }

    logGasUsed (result, fn) {
        const gasUsed = web3Utils.toBN (result.receipt.gasUsed);

        this.gasUsed.push (this.web3.eth.getTransaction (result.tx).then (tx => {
            const gasPrice = web3Utils.toBN (tx.gasPrice);
            const gasWei = gasUsed.mul (gasPrice);
            // console.log (fn + ' gas used:', web3Utils.fromWei (gasWei));
            return [fn, gasWei];
        }));
    }

    displayStats () {
        return Promise.all (this.gasUsed).then (gasUsed => {
            console.log ('Cost of transactions based on gas price:', this.gasPrice, 'gwei');
            gasUsed.forEach (fnGas => {
                console.log (fnGas[0], 'gas used:', web3Utils.fromWei (fnGas[1]), 'ETH');
            });
            return true;
        });
    }

    getGasPrice () {
        return web3Utils.toWei (this.gasPrice, 'gwei');
    }
}

exports.GasTracker = GasTracker;
