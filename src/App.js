import React, {Component} from 'react'
import CoinMixerContract from '../build/contracts/CoinMixer.json'
import getWeb3 from './utils/getWeb3'
import Web3 from 'web3'
import utils from 'web3-utils'
import {Button} from 'rmwc/Button';
import {Toolbar, ToolbarRow, ToolbarTitle} from 'rmwc/Toolbar';
import {Grid, GridCell} from 'rmwc/Grid';
import {
    DefaultDialogTemplate,
    Dialog,
    DialogBackdrop,
    DialogBody,
    DialogFooter,
    DialogFooterButton,
    DialogHeader,
    DialogHeaderTitle,
    DialogSurface
} from 'rmwc/Dialog';
import {TextField} from 'rmwc/TextField';
import {
    List,
    ListDivider,
    ListItem,
    ListItemGraphic,
    ListItemMeta,
    ListItemText
} from 'rmwc/List';


import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'
import './css/material-components-web.min.css'

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
            accounts: null
        }
    }

    componentWillMount () {
        // Get network provider and web3 instance.
        // See utils/getWeb3 for more info.

        getWeb3
            .then (results => {
                this.setState ({
                    web3: results.web3
                });

                // Instantiate contract once web3 provided.
                this.instantiateContract ()
            })
            .catch (() => {
                console.log ('Error finding web3.')
            })
    }

    instantiateContract () {
        /*
         * SMART CONTRACT EXAMPLE
         *
         * Normally these functions would be called in the context of a
         * state management library, but for convenience I've placed them here.
         */

        const contract = require ('truffle-contract');
        const coinMixer = contract (CoinMixerContract);
        //TODO: not sure why relying on truffle.js does not work
        let provider = new Web3.providers.HttpProvider ("http://127.0.0.1:7545");
        coinMixer.setProvider (provider);


        // Get accounts.
        this.state.web3.eth.getAccounts ((error, accounts) => {
            this.setState ({ accounts: accounts });

            coinMixer.deployed ().then ((instance) => {
                this.setState ({ contract: instance });
                this.updateDealTitles ();
            });
        })
    }

    updateDealTitles () {
        this.state.contract.listDealTitles ({ from: this.state.accounts[0] })
            .then ((result) => {
                debugger;
                return this.setState ({ dealTitles: result });
            });
    }

    updateDealState (event) {
        event.preventDefault ();
        let newDeal = this.state.newDeal;
        let name = event.target.name;
        let value = event.target.value;

        newDeal[name] = value;

        this.setState ({ newDeal: newDeal });
    }

    createDeal () {
        let newDeal = this.state.newDeal;
        let amountEth = newDeal.deposit;
        let depositInWei = utils.toWei (amountEth);
        let account = this.state.accounts[0];
        this.state.contract.newDeal (newDeal.title, newDeal.numParticipants, depositInWei, { from: account })
            .then ((result) => {
                debugger;
                this.updateDealTitles ();
            });
    }

    render () {
        return (
            <div className="App">
                <Toolbar>
                    <ToolbarRow>
                        <ToolbarTitle>Coin Mixer</ToolbarTitle>
                    </ToolbarRow>
                </Toolbar>

                <Grid>
                    <GridCell span="12">
                        <h2>A Decentralized Coin Mixer for Ethereum</h2>
                        <p><i>Powered by Enigma</i></p>
                    </GridCell>
                    <GridCell span="12">
                        <ListDivider/>
                        <p>To orchestrate a new mixer.</p>
                        <Button raised
                                onClick={evt => this.setState ({ standardDialogOpen: true })}
                        >Create Mixer</Button>
                    </GridCell>
                    <GridCell span="12">
                        <ListDivider/>
                        <p>To send ETH via an existing mixer.</p>
                        <List>
                            {this.state.dealTitles.map (function (title) {
                                return <ListItem>
                                    <ListItemGraphic>people</ListItemGraphic>
                                    <ListItemText>{title}</ListItemText>
                                    <ListItemMeta>info</ListItemMeta>
                                </ListItem>;
                            })}
                        </List>
                        <ListDivider/>
                    </GridCell>
                </Grid>
                <Dialog
                    open={this.state.standardDialogOpen}
                    onClose={evt => this.setState ({ standardDialogOpen: false })}
                >
                    <DialogSurface>
                        <DialogHeader>
                            <DialogHeaderTitle>Create Mixer</DialogHeaderTitle>
                        </DialogHeader>
                        <DialogBody>
                            <p>You are about to initiate a new mixer. Please
                                select the number of participants
                                and deposit amount of each participant.</p>
                            <Grid>
                                <GridCell span="6">
                                    <TextField
                                        name="title"
                                        onChange={this.updateDealState.bind (this)}
                                        fullwidth
                                        label="Title..."
                                    />
                                </GridCell>
                                <GridCell span="3">
                                    <TextField
                                        name="numParticipants"
                                        onChange={this.updateDealState.bind (this)}
                                        fullwidth
                                        label="Number of Participants..."
                                    />
                                </GridCell>
                                <GridCell span="3">
                                    <TextField
                                        name="deposit"
                                        onChange={this.updateDealState.bind (this)}
                                        fullwidth
                                        label="Deposit Amount..."
                                    />
                                </GridCell>
                            </Grid>
                        </DialogBody>
                        <DialogFooter>
                            <DialogFooterButton cancel>
                                Cancel
                            </DialogFooterButton>
                            <DialogFooterButton
                                accept
                                onClick={this.createDeal.bind (this)}>
                                Create Deal
                            </DialogFooterButton>
                        </DialogFooter>
                    </DialogSurface>
                    <DialogBackdrop/>
                </Dialog>
            </div>
        );
    }
}

export default App
