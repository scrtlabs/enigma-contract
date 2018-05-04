import React from 'react';
import Button from 'material-ui/Button';
import TextField from 'material-ui/TextField';
import {CircularProgress} from 'material-ui/Progress';
import Dialog, {
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from 'material-ui/Dialog';

import elliptic from 'elliptic';
import {
    getDerivedKey,
    encryptMessage,
    getPublicKey
} from './enigma-utils';

class DepositDialog extends React.Component {
    constructor (props) {
        super (props);

    }

    state = {
        open: false,
        deal: {},
        deposit: {},
        loading: false
    };

    componentWillReceiveProps (nextProps) {
        this.setState ({ open: nextProps.open });
        this.setState ({ deal: nextProps.deal });
        this.setState ({ deposit: { amount: nextProps.deal.deposit } })
    };

    encryptAddress = () => {
        return new Promise ((resolve, reject) => {
            let deposit = this.state.deposit;

            // TODO: where do we get this from?
            // Use this value for a default private key, or comment it out to generate a new one
            let myPrivateKey = '05737d00887cf742635ec808b17d30ed581ef3cab3c3b87b568d9826e545da0b';

            if (!(typeof myPrivateKey !== 'undefined' && myPrivateKey)) {
                const ec = elliptic.ec ('secp256k1');
                myPrivateKey = ec.genKeyPair ().getPrivate ('hex');
                console.log ('Your new private key is ' + myPrivateKey)
            }

            const enclavePublicKey = '046712d5870650d25656f0c606548013dd3f0b64a3e927c0f35eb9c269461cef94763daeece70ea5be07091f61f36bef309ffce0e64125005180e87cf1b7730c2a'
            const derivedKey = getDerivedKey (enclavePublicKey, myPrivateKey);

            console.log ('Derived Key (keep it secret): ' + derivedKey);

            const msg = deposit.destinationAddress;
            const result = encryptMessage (derivedKey, msg);

            console.log ('My public key is: ' + getPublicKey (myPrivateKey));
            console.log ('Encrypted message: ' + result[0]);
            console.log ('IV: ' + result[1]);

            deposit.destinationAddress = result[0];
            return this.setState ({ deposit: deposit }, () => {
                this.setState ({ loading: false });
                resolve ();
            });
        });
    };

    handleMakeDeposit = () => {
        this.setState ({ loading: true });
        this.encryptAddress ().then (() => {
            this.props.makeDeposit (this.state.deal, this.state.deposit);
            this.setState ({ open: false });
        });
    };

    handleClose = () => {
        this.setState ({ open: false });
        this.props.onClose ();
    };

    updateDepositState (event) {
        event.preventDefault ();
        let deposit = this.state.deposit;
        let name = event.target.name;
        let value = event.target.value;

        deposit[name] = value;

        this.setState ({ deposit: deposit });
    }

    render () {
        return (
            <Dialog
                open={this.state.open}
                onClose={evt => this.handleClose ()}
            >
                <DialogTitle>
                    Make Deposit
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>You are about to make a deposit.
                        Enter your destination address. Note that your address
                        will be encrypted before leaving your
                        computer.</DialogContentText>
                    <TextField
                        name="amount"
                        onChange={this.updateDepositState.bind (this)}
                        label="Amount..."
                        disabled
                        value={this.state.deposit.amount}
                    />
                    <TextField
                        name="destinationAddress"
                        onChange={this.updateDepositState.bind (this)}
                        label="Destination Address..."
                        type="password"
                        style={{ width: '300px' }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={this.handleClose} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={this.handleMakeDeposit} color="primary">
                        {this.state.loading ?
                            <CircularProgress size={14}/> :
                            <span>Make Deposit</span>}
                    </Button>
                </DialogActions>
            </Dialog>
        )
    };
}

export default DepositDialog;
