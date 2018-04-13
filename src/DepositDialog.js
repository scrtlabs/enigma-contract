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

    handleMakeDeposit = () => {
        this.setState ({ loading: true });
        setTimeout (() => {
            this.props.makeDeposit (this.state.deal, this.state.deposit);
            this.setState ({ open: false });
            setTimeout (() => this.setState ({ loading: false }), 300);
        }, 5000);
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
