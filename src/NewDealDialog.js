import React from 'react';
import TextField from 'material-ui/TextField';
import Dialog, {
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from 'material-ui/Dialog';
import Button from 'material-ui/Button';

class NewDealDialog extends React.Component {
    constructor (props) {
        super (props);

    }

    state = {
        open: false,
        newDeal: {},
        activeStep: 0
    };

    componentWillReceiveProps (nextProps) {
        this.setState ({ open: nextProps.open });
    }

    handleCreateDeal = () => {
        this.props.createDeal (this.state.newDeal);
        this.setState ({ open: false });
    };

    handleClose = () => {
        this.setState ({ open: false });
        this.props.onClose ()
    };

    updateDealState (event) {
        event.preventDefault ();
        let newDeal = this.state.newDeal;
        let name = event.target.name;
        let value = event.target.value;

        newDeal[name] = value;

        this.setState ({ newDeal: newDeal });
    }

    render () {
        return (
            <Dialog
                open={this.state.open}
                onClose={evt => this.handleClose ()}
            >
                <DialogTitle>
                    Create Deal
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>You are about to initiate a new
                        mixer. Please
                        select the number of participants
                        and deposit amount of each
                        participant.</DialogContentText>
                    <TextField
                        name="title"
                        onChange={this.updateDealState.bind (this)}
                        label="Title..."
                    />
                    <TextField
                        name="numParticipants"
                        onChange={this.updateDealState.bind (this)}
                        label="Participants..."
                    />
                    <TextField
                        name="deposit"
                        onChange={this.updateDealState.bind (this)}
                        label="Deposit Amount..."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={this.handleClose} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={this.handleCreateDeal} color="primary">
                        Create Deal
                    </Button>
                </DialogActions>
            </Dialog>
        )
    };
}

export default NewDealDialog;
