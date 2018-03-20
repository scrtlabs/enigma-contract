let { EventEmitter } = require ('fbemitter');
import Cookies from 'js-cookie';

class MockNetwork extends EventEmitter {
    constructor (web3, accounts, contract) {
        super ();
        this.web3 = web3;
        this.accounts = accounts;
        this.contract = contract;

        let events = Cookies.get ('events');
        try {
            this.events = JSON.parse (events);
        } catch (e) {
            this.events = [];
        }
        this.simulateValidators ();
    }

    createData = (tx, blockNumber, callable, status, validation, validation_req, cost_eng, cost_eth) => {
        return {
            id: tx,
            blockNumber,
            callable,
            status,
            validation,
            validation_req,
            cost_eng,
            cost_eth
        };
    };

    registerEvents = (allEvents) => {
        let filteredEvents = [];
        allEvents.forEach ((evt) => {
            let index = this.events.findIndex (e => e.transactionHash === evt.id && e.blockNumber === evt.blockNumber);
            if (index === -1) {
                filteredEvents.push (evt);
            }
        });

        filteredEvents.forEach ((evt) => {
            let callable = this.web3.toUtf8 (evt.args.callable);
            let event = this.createData (evt.transactionHash, evt.blockNumber, callable, 0, 0, 10, 1, 0.001);

            this.events.push (event);
        });

        this.events.sort ((a, b) => (b.blockNumber < a.blockNumber ? -1 : 1));
        this.events.sort ((a, b) => (b.status < a.status ? -1 : 1));

        this.save ();
    };

    simulateValidators = () => {
        console.log ('simulating validator activity');
        let emitted = false;
        this.events.forEach ((event) => {
            if (emitted) return false;

            const coin = Math.round (Math.random ());
            if (coin === 1) {
                if (event.status === 0) {
                    event.status = 1;
                    emitted = true;
                } else if (event.status === 1 || event.status === 2) {
                    event.status = 2;
                    event.validation++;

                    if (event.validation === event.validation_req) {
                        event.status = 3;
                    }
                    emitted = true;
                }
            }
        });

        if (emitted) {
            this.save ();
        }

        let delay = Math.floor (Math.random () * (3000 - 1000 + 1)) + 1000;
        setTimeout (this.simulateValidators, delay);
    };

    save = () => {
        Cookies.set ('events', JSON.stringify (this.events));
        this.emit ('change', this.events);
    }
}

export default MockNetwork;