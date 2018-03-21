import React, {Component} from 'react'
import CoinMixerContract from '../build/contracts/CoinMixer.json'
import getWeb3 from './utils/getWeb3'


import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'
import IconButton from "material-ui/IconButton";
import MenuIcon from 'material-ui-icons/Menu';
import AppBar from "material-ui/AppBar";
import Toolbar from "material-ui/Toolbar";
import Typography from "material-ui/Typography";
import {createMuiTheme, MuiThemeProvider} from 'material-ui/styles';
import blue from 'material-ui/colors/blue';
import ContractTable from './ContractTable';
import ComputationTable from './ComputationTable';
import MockNetwork from './services/MockNetwork';


const theme = createMuiTheme ({
    palette: {
        primary: blue,
    },
});


class Register extends Component {
    constructor (props) {
        super (props);

        this.state = {
            web3: null,
            contract: null,
            accounts: null,
            contracts: [],
            deployedContracts: [],
            selectedContracts: [],
            filters: [],
            events: [],
            network: null
        }
    }

    componentWillMount () {
        // Get network provider and web3 instance.
        // See utils/getWeb3 for more info.

        // Is there is an injected web3 instance?
        // This uses Metamask if available
        getWeb3.then (results => {
            this.setState ({ web3: results.web3 }, this.instantiateContract);
        }).catch (() => {
            console.log ('Error finding web3.')
        });
    }

    instantiateContract () {
        /**
         * Instantiate the smart contract and include it in the state.
         * @type {contract}
         */
        const contract = require ('truffle-contract');
        const coinMixer = contract (CoinMixerContract);
        //TODO: not sure why relying on truffle.js does not work
        // let provider = new Web3.providers.HttpProvider ("http://127.0.0.1:7545");
        coinMixer.setProvider (this.state.web3.currentProvider);


        // Get accounts.
        this.state.web3.eth.getAccounts ((error, accounts) => {
            this.state.web3.eth.defaultAccount = accounts[0];
            this.setState ({ accounts: accounts });

            coinMixer.deployed ().then ((instance) => {
                this.setState ({ contract: instance }, () => {
                    // Fetching contracts to populate the table
                    this.findContracts ()
                        .then ((contracts) => {
                            this.setState ({ contracts: contracts }, this.fetchContracts);
                        });
                    //Subscribing to our Network
                    this.subscribeEventUpdates ();
                });
            });
        });
    }

    findContracts = () => {
        let counter = 0;

        function createData (name, address, eng, eth) {
            let contract = { id: counter, name, address, eng, eth };
            counter += 1;
            return contract;
        }

        return new Promise ((resolve, reject) => {
            resolve ([
                createData ('CoinMixer', '0xf12b5dd4ead5f743c6baa640b0216200e89b60da', 20, 1),
            ]);
        });
    };

    fetchContracts = () => {
        const contract = require ('truffle-contract');

        let promises = [];
        let deployedContracts = [];
        this.state.contracts.forEach (item => {
            const CoinMixerContract = require ('../build/contracts/' + item['name'] + '.json');
            const instance = contract (CoinMixerContract);
            instance.setProvider (this.state.web3.currentProvider);

            promises.push (
                instance.deployed ().then ((instance) => {
                    deployedContracts.push (instance);
                })
            );
        });
        Promise.all (promises).then (() => {
            this.setState ({ deployedContracts: deployedContracts });
        });
    };

    selectContracts = (indexes) => {
        this.setState ({ selectedContracts: indexes }, this.subscribeEvents);
    };

    subscribeEvents = () => {
        this.state.filters.forEach ((events) => {
            events.stopWatching ((result) => {
                console.log ('stopped watching', result);
            });
        });

        let allEvents = [];
        let filters = [];
        let contracts = this.state.selectedContracts.map (i => this.state.deployedContracts[i]);
        contracts.forEach (contract => {
            // watch for an event with {some: 'args'}
            let event = this.state.web3.sha3 ('SecretCall(bytes32,bytes32[],bytes32,uint)');
            let events = contract.allEvents ({
                fromBlock: 0,
                toBlock: 'latest',
                topics: [event] //TODO: find out why it's not filtering other events out
            });

            events.watch ((error, result) => {
                if (result.event === 'SecretCall') {
                    allEvents.push (result);
                    console.log ('pushing events', allEvents);
                    this.state.network.registerEvents (contract.address, allEvents);
                }
            });

            // would get all past logs again.
            events.get ((error, logs) => {
                logs.forEach ((result) => {
                    if (result.event === 'SecretCall') {
                        allEvents.push (result);
                    }
                });
                console.log ('pushing events', allEvents);
                this.state.network.registerEvents (contract.address, allEvents);
            });

            filters.push (events);
        });

        this.setState ({ filters: filters });
    };

    subscribeEventUpdates = () => {
        this.state.network = new MockNetwork (this.state.web3, this.state.accounts, this.state.contract);

        let token = this.state.network.addListener ('change', (events) => {
            console.log ('got updated events', events);
            this.setState ({ events: events });
        });
    };

    signComputation = (event) => {
        let contract = this.state.deployedContracts.find (c => c.address === event.address);
        let account = this.state.accounts[0];
        // TODO: help web3 arrange and cast argument by reading the function definition
        let args = [event.args[0], [event.args[1]]];
        let params = [{
            from: account,
            gas: 9712388,
            gasPrice: 1000000000
        }];
        params = args.concat (params);
        debugger;
        contract[event.callback].apply (contract, params)
            .then ((result) => {
                debugger;
            }, (err) => {
                console.error ('unable to commit back', err);
                debugger;
            });
    };

    render () {
        return (
            <MuiThemeProvider theme={theme}>
                <div style={{ background: '#eee' }}>
                    <AppBar position="static" color="primary">
                        <Toolbar style={{
                            display: 'flex',
                            flexDirection: 'row'
                        }}>
                            <IconButton color="inherit" aria-label="Menu">
                                <MenuIcon/>
                            </IconButton>
                            <Typography variant="title" color="inherit"
                                        style={{ flex: 1 }}>
                                Register Computation
                            </Typography>
                        </Toolbar>
                    </AppBar>

                    <div style={{
                        padding: '0 20px 10px 20px',
                        overflow: 'auto',
                        height: '100%',
                    }}>
                        <ContractTable
                            data={this.state.contracts}
                            onSelect={this.selectContracts}
                        ></ContractTable>
                        <ComputationTable
                            data={this.state.events}
                            onSign={this.signComputation}
                        ></ComputationTable>
                    </div>

                </div>
            </MuiThemeProvider>
        );
    }
}

export default Register
