import React from 'react';
import Dialog, {
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from 'material-ui/Dialog';
import Button from 'material-ui/Button';
import Typography from "material-ui/Typography";


const EVENT_LABELS = {
    NewDeal: 'New Deal'
};

class TxDialog extends React.Component {
    constructor (props) {
        super (props);

    }

    state = {
        open: false,
        evt: {}
    };

    componentWillReceiveProps (nextProps) {
        this.setState ({ evt: nextProps.evt });
        this.setState ({ open: nextProps.open });
    }

    handleClose = () => {
        this.setState ({ open: false });
        this.props.onClose ();
    };

    render () {

        return (
            <Dialog
                open={this.state.open}
                onClose={this.handleClose}
            >
                <DialogTitle>
                    Transaction Confirmed
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {(EVENT_LABELS[this.state.evt.event]) ? EVENT_LABELS[this.state.evt.event] : this.state.evt.event}
                        &nbsp;transaction created successfully:
                        <Typography variant="caption" align="center"
                                    style={{ paddingTop: '20px' }}
                        >
                            {this.state.evt.transactionHash}
                        </Typography>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={this.handleClose} color="primary">
                        Okay
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

// We need an intermediary variable for handling the recursive nesting.
// const TxModalWrapped = withStyles (styles) (TxDialog);

export default TxDialog;