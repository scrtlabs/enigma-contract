import React, {Component} from 'react'
import SimpleStorageContract from '../build/contracts/SimpleStorage.json'
import getWeb3 from './utils/getWeb3'
import {Button} from 'rmwc/Button';
import {
    Toolbar,
    ToolbarRow,
    ToolbarSection,
    ToolbarTitle,
    ToolbarMenuIcon,
    ToolbarIcon
} from 'rmwc/Toolbar';
import {SimpleMenu, MenuItem} from 'rmwc/Menu';
import {Grid, GridCell} from 'rmwc/Grid';
import {
    Dialog,
    DefaultDialogTemplate,
    DialogSurface,
    DialogHeader,
    DialogHeaderTitle,
    DialogBody,
    DialogFooter,
    DialogFooterButton,
    DialogBackdrop
} from 'rmwc/Dialog';
import {TextField, TextFieldIcon, TextFieldHelperText} from 'rmwc/TextField';
import {Select} from 'rmwc/Select';
import {
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryText,
    ListItemGraphic,
    ListItemMeta
} from 'rmwc/List';
import {
    Card,
    CardAction,
    CardActions
} from 'rmwc/Card';

import {
    ListDivider,
} from 'rmwc/List';

import {
    Icon,
} from 'rmwc/Icon';

import { Typography } from 'rmwc/Typography';


import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'
import './css/material-components-web.min.css'

class App extends Component {
    constructor(props) {
        super(props)

        this.state = {
            storageValue: 0,
            web3: null
        }
    }

    componentWillMount() {
        // Get network provider and web3 instance.
        // See utils/getWeb3 for more info.

        getWeb3
            .then(results => {
                this.setState({
                    web3: results.web3
                })

                // Instantiate contract once web3 provided.
                this.instantiateContract()
            })
            .catch(() => {
                console.log('Error finding web3.')
            })
    }

    instantiateContract() {
        /*
         * SMART CONTRACT EXAMPLE
         *
         * Normally these functions would be called in the context of a
         * state management library, but for convenience I've placed them here.
         */

        const contract = require('truffle-contract')
        const simpleStorage = contract(SimpleStorageContract)
        simpleStorage.setProvider(this.state.web3.currentProvider)

        // Declaring this for later so we can chain functions on SimpleStorage.
        var simpleStorageInstance

        // Get accounts.
        this.state.web3.eth.getAccounts((error, accounts) => {
            simpleStorage.deployed().then((instance) => {
                simpleStorageInstance = instance

                // Stores a given value, 5 by default.
                return simpleStorageInstance.set(5, {from: accounts[0]})
            }).then((result) => {
                // Get the value from the contract to prove it worked.
                return simpleStorageInstance.get.call(accounts[0])
            }).then((result) => {
                // Update state with the result.
                return this.setState({storageValue: result.c[0]})
            })
        })
    }

    render() {
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
                        <ListDivider />
                        <p>To orchestrate a new mixer.</p>
                        <Button raised
                                onClick={evt => this.setState({standardDialogOpen: true})}
                        >Create Mixer</Button>
                    </GridCell>
                    <GridCell span="12">
                        <ListDivider />
                        <p>To send ETH via an existing mixer.</p>
                        <List>
                            <ListItem>
                                <ListItemGraphic>people</ListItemGraphic>
                                <ListItemText>My Mixer</ListItemText>
                                <ListItemMeta>info</ListItemMeta>
                            </ListItem>

                            <ListItem>
                                <ListItemGraphic>people</ListItemGraphic>
                                <ListItemText>A Great Mixer</ListItemText>
                                <ListItemMeta>info</ListItemMeta>
                            </ListItem>

                            <ListItem>
                                <ListItemGraphic>people</ListItemGraphic>
                                <ListItemText>Buying Pool</ListItemText>
                                <ListItemMeta>info</ListItemMeta>
                            </ListItem>
                        </List>
                        <ListDivider />
                    </GridCell>
                </Grid>
                {/*<p>Try changing the value stored on <strong>line*/}
                {/*59</strong> of App.js.</p>*/}
                {/*<p>The stored value*/}
                {/*is: {this.state.storageValue}</p>*/}
                <Dialog
                    open={this.state.standardDialogOpen}
                    onClose={evt => this.setState({standardDialogOpen: false})}
                >
                    <DialogSurface>
                        <DialogHeader>
                            <DialogHeaderTitle>Create Mixer</DialogHeaderTitle>
                        </DialogHeader>
                        <DialogBody>
                            <p>You are about to initiate a new mixer. Please select the number of participants
                                and deposit amount of each participant.</p>
                            <Grid>
                                <GridCell span="6">
                                    <TextField fullwidth label="Title..."/>
                                </GridCell>
                                <GridCell span="3">
                                    <TextField fullwidth label="Number of Participants..."/>
                                </GridCell>
                                <GridCell span="3">
                                    <TextField fullwidth label="Deposit Amount..."/>
                                </GridCell>
                            </Grid>
                        </DialogBody>
                        <DialogFooter>
                            <DialogFooterButton cancel>Cancel</DialogFooterButton>
                            <DialogFooterButton accept>Sweet!</DialogFooterButton>
                        </DialogFooter>
                    </DialogSurface>
                    <DialogBackdrop/>
                </Dialog>
            </div>
        );
    }
}

export default App
