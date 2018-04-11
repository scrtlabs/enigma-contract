import React, {Component} from 'react'
import EnigmaContract from '../build/contracts/Enigma.json'
import getWeb3 from './utils/getWeb3'
import {createMuiTheme, MuiThemeProvider} from 'material-ui/styles';
import AppBar from "material-ui/AppBar";
import Toolbar from "material-ui/Toolbar";
import Typography from "material-ui/Typography";
import IconButton from "material-ui/IconButton";
import MenuIcon from 'material-ui-icons/Menu';
import Button from 'material-ui/Button';
import TxModal from './TxDialog';

import blue from 'material-ui/colors/blue';

const theme = createMuiTheme ({
    palette: {
        primary: blue,
    },
});

class Worker extends Component {
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
            network: null,
            txModalOpen: false,
            lastEvent: {}
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
        const enigma = contract (EnigmaContract);

        enigma.setProvider (this.state.web3.currentProvider);

        // Get accounts.
        this.state.web3.eth.getAccounts ((error, accounts) => {
            this.state.web3.eth.defaultAccount = accounts[0];
            this.setState ({ accounts: accounts });

            enigma.deployed ().then ((instance) => {
                this.setState ({ contract: instance }, () => {
                    console.log ('got deployed contract', instance);
                });
            });
        });
    }

    handleCompute = (event) => {
        console.log ('computing');
        const account = this.state.accounts[0];
        return this.state.contract.compute (account, '0x1eed094939a2d4a2048a0b267edb4e5952345856', 'mixAddresses', ['0', 'test'], 'distribute', {
            from: account,
            gas: 4712388,
            gasPrice: 1000000000
        }).then ((result) => {
            debugger;
            // We can loop through result.logs to see if we triggered the Transfer event.
            for (var i = 0; i < result.logs.length; i++) {
                var log = result.logs[i];

                if (log.event == 'ComputeTask') {
                    // We found the event!
                    console.log ('new computation created', log.event);

                    this.setState ({ lastEvent: log }, () => this.openTxModal ());
                    break;
                }
            }
        }, (err) => {
            console.error ('unable to run computation', err);
            debugger;
        });
    };

    openTxModal = () => {
        this.setState ({ txModalOpen: true });
    };

    closeTxModal = () => {
        this.setState ({ txModalOpen: false });
        this.fetchDeals ();
    };

    render () {
        return (
            <MuiThemeProvider theme={theme}>
                <div>
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
                                Worker
                            </Typography>
                        </Toolbar>
                    </AppBar>

                    <div style={{
                        padding: '20px',
                        overflow: 'auto',
                        height: '100%',
                    }}>
                        <Button
                            onClick={this.handleCompute}
                            variant="raised">
                            Compute
                        </Button>
                    </div>
                    <TxModal
                        open={this.state.txModalOpen}
                        evt={this.state.lastEvent}
                        onClose={this.closeTxModal}
                    >
                    </TxModal>
                </div>
            </MuiThemeProvider>
        );
    }
}

export default Worker
