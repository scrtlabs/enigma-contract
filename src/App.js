import React, {Component} from 'react'
import CoinMixerContract from '../build/contracts/CoinMixer.json'
import getWeb3 from './utils/getWeb3'
import utils from 'web3-utils'


import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'
import NewDealDialog from './NewDealDialog';
import Button from "material-ui/Button";
import AppBar from "material-ui/AppBar";
import Toolbar from "material-ui/Toolbar";
import Typography from "material-ui/Typography";


class App extends Component {
    constructor (props) {
        super (props);

        this.state = {
            dealTitles: [],
            web3: null,
            newDeal: {
                title: null,
                deposit: null,
                numParticipants: null
            },
            contract: null,
            accounts: null,
            newDealDialogOpen: false
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
                                    deal.active = result[0];
                                    deal.numParticipants = result[1];
                                    deal.numDeposits = result[2];
                                    deal.depositSum = result[3];
                                    deal.numDestAddresses = result[4];
                                    deals.push (deal);
                                })
                        );
                    }
                }
                return Promise.all (promises)
                    .then (() => this.setState ({ dealTitles: deals }));
            });
    }


    createDeal (newDeal) {
        this.setState ({ newDealDialogOpen: false });

        let amountEth = newDeal.deposit;
        let depositInWei = utils.toWei (amountEth);
        let account = this.state.accounts[0];
        // this.state.contract.newDeal(newDeal.title, newDeal.numParticipants, depositInWei, {
        this.state.contract.newDeal (newDeal.title, depositInWei, newDeal.numParticipants, {
            from: account,
            gas: 4712388,
            gasPrice: 1000000000
        }).then ((result) => {
            debugger;
            // We can loop through result.logs to see if we triggered the Transfer event.
            for (var i = 0; i < result.logs.length; i++) {
                var log = result.logs[i];

                if (log.event == 'NewDeal') {
                    // We found the event!
                    console.log ('new deal created')
                    break;
                }
            }
            this.fetchDeals ();
        }, (err) => {
            debugger;
        })
    }

    render () {
        return (
            <div className="App">
                <AppBar position="static" color="default">
                    <Toolbar>
                        <Typography variant="title" color="inherit">
                            Coin Mixer
                        </Typography>
                    </Toolbar>
                </AppBar>

                <div style={{ padding: 20 }}>
                    <h2>A Decentralized Coin Mixer for Ethereum</h2>
                    <p><i>Powered by Enigma</i></p>
                    <p>To orchestrate a new mixer.</p>
                    <Button variant="raised"
                            onClick={evt => this.setState ({ newDealDialogOpen: true })}
                    >Create Mixer</Button>
                    <p>To send ETH via an existing mixer.</p>
                    <ul>
                        {this.state.dealTitles.map (function (title) {
                            return <li key={title.id.toString ()}>
                                {title.label}
                            </li>;
                        })}
                    </ul>
                </div>

                <NewDealDialog
                    open={this.state.newDealDialogOpen}
                    createDeal={this.createDeal.bind (this)}
                />
            </div>
        );
    }
}

export default App
