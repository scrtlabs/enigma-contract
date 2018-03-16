import React, {Component} from 'react'
import CoinMixerContract from '../build/contracts/CoinMixer.json'
import getWeb3 from './utils/getWeb3'
import utils from 'web3-utils'


import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'
import NewDealDialog from './NewDealDialog';
import DepositDialog from './DepositDialog';
import Button from "material-ui/Button";
import IconButton from "material-ui/IconButton";
import MenuIcon from 'material-ui-icons/Menu';
import AppBar from "material-ui/AppBar";
import Toolbar from "material-ui/Toolbar";
import Typography from "material-ui/Typography";
import DealTable from './DealTable';
import {MuiThemeProvider, createMuiTheme} from 'material-ui/styles';
import blue from 'material-ui/colors/blue';


const theme = createMuiTheme ({
    palette: {
        primary: blue,
    },
});


class App extends Component {
    constructor (props) {
        super (props);

        this.state = {
            deals: [],
            selectedDeal: {},
            web3: null,
            newDeal: {
                title: null,
                deposit: null,
                numParticipants: null
            },
            contract: null,
            accounts: null,
            newDealDialogOpen: false,
            depositDialogOpen: false
        }
    }

    componentWillMount () {
        // Get network provider and web3 instance.
        // See utils/getWeb3 for more info.

        // Is there is an injected web3 instance?
        // This uses Metamask if available
        getWeb3.then (results => {
            this.setState ({ web3: results.web3 }, () => this.instantiateContract ());

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
                this.setState ({ contract: instance }, () => this.fetchDeals ());
            });
        });
    }

    fetchDeals () {
        /**
         * Fetch deals from the smart contract.
         * Because of Solidity limitations, this requires several requests:
         * 1) Fetch an array of contract title which indexes match the deal Ids.
         * 2) For each deal Id, fetch the status.
         *
         * The data is then consolidated and included into the state.
         */
        this.state.contract.listDealTitles.call ({}, { from: this.state.accounts[0] })
            .then ((result) => {
                if (!result || !typeof Array.isArray (result)) {
                    return null;
                }

                let promises = [];
                let deals = [];
                for (let i = 0; i < result.length; i++) {
                    if (result[i]) {
                        let deal = {
                            id: i,
                            label: this.state.web3.toUtf8 (result[i])
                        };
                        promises.push (
                            this.state.contract.dealStatus.call (i)
                                .then ((result) => {
                                    deal.active = result[0].toNumber ();
                                    deal.numParticipants = result[1].toNumber ();
                                    deal.numDeposits = result[2].toNumber ();
                                    deal.depositSum = result[3].toNumber ();
                                    deal.numDestAddresses = result[4].toNumber ();
                                    deals.push (deal);
                                })
                        );
                    }
                }
                return Promise.all (promises)
                    .then (() => this.setState ({ deals: deals }));
            });
    }


    createDeal (newDeal) {
        /**
         * Submits a transaction to the smart contract to create a deal based on
         * data in the state. Then updates the list of deals.
         */
        self.closeNewDealDialog ();
        let amountEth = newDeal.deposit;
        let depositInWei = utils.toWei (amountEth);
        let account = this.state.accounts[0];

        this.state.contract.newDeal (newDeal.title, depositInWei, newDeal.numParticipants, {
            from: account,
            gas: 4712388,
            gasPrice: 1000000000
        }).then ((result) => {
            //TODO: use an event handles instead
            // We can loop through result.logs to see if we triggered the Transfer event.
            for (var i = 0; i < result.logs.length; i++) {
                var log = result.logs[i];

                if (log.event == 'NewDeal') {
                    // We found the event!
                    console.log ('new deal created')
                    break;
                }
            }
        }, (err) => {
            debugger;
        })
    }

    closeNewDealDialog = () => {
        this.setState ({ newDealDialogOpen: false });
    };

    selectDeal (dealId) {
        let deal = this.state.deals.find ((d) => d.id === dealId);
        if (deal) {
            this.setState ({ selectedDeal: deal });
            this.setState ({ depositDialogOpen: true });
        }
    }

    closeDepositDialog = () => {
        this.setState ({ depositDialogOpen: false })
    };

    makeDeposit (deposit) {

    }

    render () {
        return (
            <MuiThemeProvider theme={theme}>
                <div className="App"
                     style={{ overflow: 'hidden', paddingTop: '56px' }}
                >
                    <AppBar
                        style={{ position: 'fixed', top: 0 }}
                        color="primary"
                    >
                        <Toolbar style={{
                            display: 'flex',
                            flexDirection: 'row'
                        }}>
                            <IconButton color="inherit" aria-label="Menu">
                                <MenuIcon/>
                            </IconButton>
                            <Typography variant="title" color="inherit"
                                        style={{ flex: 1 }}>
                                Coin Mixer
                            </Typography>
                            <Button color="inherit"
                                    onClick={evt => this.setState ({ newDealDialogOpen: true })}
                            >Organize Deal</Button>
                        </Toolbar>
                    </AppBar>

                    <div style={{
                        padding: 20,
                        overflow: 'auto',
                        height: '100%',
                    }}>
                        <DealTable
                            deals={this.state.deals}
                            selectDeal={this.selectDeal.bind (this)}
                        />
                    </div>

                    <NewDealDialog
                        open={this.state.newDealDialogOpen}
                        createDeal={this.createDeal.bind (this)}
                        onClose={this.closeNewDealDialog}
                    />
                    <DepositDialog
                        open={this.state.depositDialogOpen}
                        deal={this.state.selectedDeal}
                        makeDeposit={this.makeDeposit.bind (this)}
                        onClose={this.closeDepositDialog}
                    ></DepositDialog>
                </div>
            </MuiThemeProvider>
        );
    }
}

export default App
