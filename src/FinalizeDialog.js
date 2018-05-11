import React from 'react';
import Button from 'material-ui/Button';
import {LinearProgress} from 'material-ui/Progress';
import Dialog, {
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from 'material-ui/Dialog';
import Typography from "material-ui/Typography";

class FinalizeDialog extends React.Component {
    constructor (props) {
        super (props);

    }

    state = {
        open: false,
        deal: {},
        finalized: false,
        loading: false,
        status: [0]
    };

    componentWillReceiveProps (nextProps) {
        this.setState ({ open: nextProps.open });
        this.setState ({ deal: nextProps.deal });
        this.setState ({ status: nextProps.status });
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

    userPrompt = () => {
        if (this.state.status[0] === 0) {
            return <DialogContentText>
                This deal has received all of
                its {this.state.deal.numDeposits} deposits.
                As the owner, do you want to execute it?
            </DialogContentText>
        } else if (this.state.status[0] === 1) {
            return <DialogContentText>
                Please answer the Metamask prompts to approve
                the {this.state.status[1]} ENG computation fee.
            </DialogContentText>
        } else if (this.state.status[0] === 2) {
            return <div>
                <DialogContentText>
                    Approval request for {this.state.status[1]} ENG received.
                    Waiting for the transaction to mine.
                </DialogContentText>
                <Typography variant="caption" align="center"
                            style={{ paddingTop: '20px' }}
                >
                    {this.state.status[2]}
                </Typography>
                <div style={{ paddingTop: '20px' }}>
                    <LinearProgress/>
                </div>
            </div>
        } else if (this.state.status[0] === 3) {
            return <DialogContentText>
                Please answer the Metamask prompt to send the computation
                request to the Enigma Network.
            </DialogContentText>
        } else if (this.state.status[0] === 4) {
            return <div>
                <DialogContentText>
                    Computation request received. Waiting for coin mixing
                    distribution.
                </DialogContentText>
                <Typography variant="caption" align="center"
                            style={{ paddingTop: '20px' }}
                >
                    {this.state.status[1]}
                </Typography>
                <div style={{ paddingTop: '20px' }}>
                    <LinearProgress/>
                </div>
            </div>
        } else if (this.state.status[0] === 10) {
            return <DialogContentText>
                Unable to finalize deal because of
                error: {this.state.status[1]}.
            </DialogContentText>
        }
    };

    actionButtons = () => {
        if (this.state.status[0] > 0) {
            return <span></span>
        }

        return <DialogActions>
            <Button onClick={this.handleClose} color="primary">
                Cancel
            </Button>
            <Button onClick={this.handleFinalize} color="primary">
                Execute
            </Button>
        </DialogActions>
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
                    {this.userPrompt ()}
                </DialogContent>

                {this.actionButtons ()}
            </Dialog>
        )
    };
}

export default FinalizeDialog;
