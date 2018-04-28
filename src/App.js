import React, {Component} from 'react'
import CoinMixerContract from '../build/contracts/CoinMixer.json'
import EnigmaContract from '../build/contracts/Enigma.json'
import EnigmaTokenContract from '../build/contracts/EnigmaToken.json'
import getWeb3 from './utils/getWeb3'
import utils from 'web3-utils'


import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'
import NewDealDialog from './NewDealDialog';
import DepositDialog from './DepositDialog';
import FinalizeDialog from './FinalizeDialog';
import TxModal from './TxDialog';
import IconButton from "material-ui/IconButton";
import MenuIcon from 'material-ui-icons/Menu';
import AppBar from "material-ui/AppBar";
import Toolbar from "material-ui/Toolbar";
import Typography from "material-ui/Typography";
import DealTable from './DealTable';
import {MuiThemeProvider, createMuiTheme} from 'material-ui/styles';
import blue from 'material-ui/colors/blue';
import Enigma from './enigma-utils/enigma';


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
            enigma: null,
            accounts: null,
            newDealDialogOpen: false,
            depositDialogOpen: false,
            finalizeDialogOpen: false,
            selectedFilterIndex: 0,
            txModalOpen: false,
            lastEvent: {}
        }
    }

    componentWillMount () {
        // Get network provider and web3 instance.
        // See utils/getWeb3 for more info.

        // Is there is an injected web3 instance?
        // This uses Metamask if available
        // TODO: use the non-Truffle is test environments
        // let web3 = new Web3 (new Web3.providers.HttpProvider ('http://localhost:9545'))
        // this.setState ({ web3: web3 }, () => this.instantiateContract ());

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
        const token = contract (EnigmaTokenContract);
        const enigma = contract (EnigmaContract);

        coinMixer.setProvider (this.state.web3.currentProvider);
        enigma.setProvider (this.state.web3.currentProvider);
        token.setProvider (this.state.web3.currentProvider);

        // Get accounts.
        this.state.web3.eth.getAccounts ((error, accounts) => {
            this.state.web3.eth.defaultAccount = accounts[0];
            this.setState ({ accounts: accounts });

            token.deployed ().then ((instance) => {
                console.log ('enigma contract deployed', instance);
                this.setState ({ token: instance });
            });
            enigma.deployed ().then ((instance) => {
                console.log ('enigma contract deployed', instance);
                let enigma = new Enigma (instance);
                this.setState ({ enigma: enigma });
            });
            coinMixer.deployed ().then ((instance) => {
                console.log ('coin mixer contract deployed', instance);
                this.setState ({ contract: instance }, () => this.fetchDeals ());
            });
        });
    }

    fetchDeals (filter) {
        /**
         * Fetch deals from the smart contract.
         * Because of Solidity limitations, this requires several requests:
         * 1) Fetch an array of contract title which indexes match the deal Ids.
         * 2) For each deal Id, fetch the status.
         *
         * The data is then consolidated and included into the state.
         */
        // Default to open deals
        if (!filter) {
            filter = 0;
        }
        this.state.contract.listDeals.call ({}, { from: this.state.accounts[0] })
            .then ((data) => {
                if (!data || !typeof Array.isArray (data)) {
                    return null;
                }

                let statuses = data[0];
                let promises = [];
                let deals = [];
                for (let i = 0; i < statuses.length; i++) {
                    const organizes = (data[2][i] == 1);
                    // Filtering out
                    if ((filter === 0 && statuses[i] > 0) || (filter === 1 && !organizes)) {
                        continue;
                    }
                    let deal = { id: i };
                    promises.push (
                        this.state.contract.dealStatus.call (i)
                            .then ((result) => {
                                deal.title = this.state.web3.toUtf8 (result[0]);
                                deal.status = statuses[i].toNumber ();
                                deal.numParticipants = result[1].toNumber ();
                                deal.deposit = utils.fromWei (result[2].toString (), 'ether');
                                deal.numDeposits = result[3].toNumber ();
                                deal.depositSum = result[4].toNumber ();
                                deal.numDestAddresses = result[5];
                                deal.participates = (data[1][i] == 1);
                                deal.organizes = (organizes);
                                deals.push (deal);
                            })
                    );
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
        this.closeNewDealDialog ();
        let amountEth = newDeal.deposit;
        let depositInWei = utils.toWei (amountEth.toString (), 'ether');
        let account = this.state.accounts[0];

        this.state.contract.newDeal (newDeal.title, depositInWei, newDeal.numParticipants, {
            from: account,
            gas: 4712388,
            gasPrice: 1000000000
        }).then ((result) => {
            // We can loop through result.logs to see if we triggered the Transfer event.
            for (var i = 0; i < result.logs.length; i++) {
                var log = result.logs[i];

                if (log.event == 'NewDeal') {
                    // We found the event!
                    console.log ('new deal created', log.event);

                    this.setState ({ lastEvent: log }, () => this.openTxModal ());
                    break;
                }
            }
        }, (err) => {
            console.error ('unable to create deal', err);
        })
    }

    closeNewDealDialog = () => {
        this.setState ({ newDealDialogOpen: false });
    };

    selectDeal (dealId) {
        let deal = this.state.deals.find ((d) => d.id === dealId);
        if (deal) {
            this.setState ({ selectedDeal: deal });
            if (deal.status === 1 && deal.organizes) {
                this.setState ({ finalizeDialogOpen: true })
            } else {
                this.setState ({ depositDialogOpen: true });
            }
        }
    }

    closeDepositDialog = () => {
        this.setState ({ depositDialogOpen: false })
    };

    closeFinalizeDialog = () => {
        this.setState ({ finalizeDialogOpen: false })
    };

    makeDeposit (deal, deposit) {
        this.closeDepositDialog ();
        this.setState ({ selectedFilterIndex: 1 });

        let depositInWei = utils.toWei (deposit.amount.toString (), 'ether');
        this.state.contract.makeDeposit (deal.id.toString (), deposit.destinationAddress, {
            from: this.state.accounts[0],
            value: depositInWei
        })
            .then ((result) => {
                for (var i = 0; i < result.logs.length; i++) {
                    var log = result.logs[i];

                    if (log.event == 'Deposit') {
                        // We found the event!
                        console.log ('deposit created', log);
                        this.setState ({ lastEvent: log }, () => this.openTxModal ());
                        break;
                    }
                }
                //TODO: wait for the tx
            })

    }

    openTxModal = () => {
        this.setState ({ txModalOpen: true });
    };

    closeTxModal = () => {
        this.setState ({ txModalOpen: false });
        this.fetchDeals ();
    };

    setFilter = (filterIndex) => {
        this.fetchDeals (filterIndex);

    };

    finalizeDeal = (deal) => {
        this.closeFinalizeDialog ();

        // TODO: revisit this vs calling from the contract
        // This approach calls the Enigma contract directly.
        // We can either do this or use the coin mixer contract as a proxy
        // This method saves transfer and serialization opcodes and it can be better integrated
        // in the UI. I see a place for both approaches.
        this.state.contract.getEncryptedAddresses.call (deal.id, { from: this.state.accounts[0] })
            .then ((addrs) => {
                // The deal id is the first parameter
                // This is important for traceability
                // The business logic can reason about this by looking
                // at the callable function definition:
                // `mixAddresses(uint dealId, address[] destAddresses)`
                addrs.unshift (deal.id);

                let params = {
                    secretContract: this.state.contract.address,
                    callable: 'mixAddresses',
                    args: addrs,
                    callback: 'distribute'
                };

                // Users are free to set their computation fee.
                // The `estimateEngFee` is simply a guide.
                let engFee = this.state.enigma.estimateEngFee (params);
                return this.state.token.approve (this.state.accounts[0], engFee, { from: this.state.accounts[0] });

                // TODO: wrap into utility library
                // I'm leaving the code here for now short term readability
                // return this.state.enigma.compute (params, {
                //     from: this.state.accounts[0],
                //     value: engFee
                // });
            })
            .then ((result) => {
                console.log ('computation task created', result);
                this.setState ({ lastEvent: result }, () => this.openTxModal ());
            });
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
                                Coin Mixer
                            </Typography>
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
                            selectedIndex={this.state.selectedFilterIndex}
                            organizeDeal={evt => this.setState ({ newDealDialogOpen: true })}
                            selectFilter={this.setFilter}
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
                    <FinalizeDialog
                        open={this.state.finalizeDialogOpen}
                        deal={this.state.selectedDeal}
                        finalize={this.finalizeDeal}
                        onClose={this.closeFinalizeDialog}
                    ></FinalizeDialog>
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

export default App
