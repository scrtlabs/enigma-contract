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

class FinalizeDialog extends React.Component {
    constructor (props) {
        super (props);

    }

    state = {
        open: false,
        deal: {},
        finalized: false,
        loading: false
    };

    componentWillReceiveProps (nextProps) {
        this.setState ({ open: nextProps.open });
        this.setState ({ deal: nextProps.deal });
        this.setState ({ deposit: { amount: nextProps.deal.deposit } })
    };

    handleFinalize = () => {
        setTimeout (() => {
            this.setState ({ finalized: true });
            this.props.finalize (this.state.deal);
        }, 300);
    };

    handleClose = () => {
        this.setState ({ open: false });
        this.props.onClose ();
    };

    render () {
        return (
            <Dialog
                open={this.state.open}
                onClose={evt => this.handleClose ()}
            >
                <DialogTitle>
                    Finalize Deal
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>This deal has received all of
                        its {this.state.deal.numDeposits} deposits.
                        As the owner, do you want to execute it?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={this.handleClose} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={this.handleFinalize} color="primary">
                        Execute
                    </Button>
                </DialogActions>
            </Dialog>
        )
    };
}

export default FinalizeDialog;
