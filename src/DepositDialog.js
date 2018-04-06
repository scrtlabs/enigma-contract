import React from 'react';
import Button from 'material-ui/Button';
import TextField from 'material-ui/TextField';
import Dialog, {
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from 'material-ui/Dialog';
import Stepper, {Step, StepLabel, StepContent} from 'material-ui/Stepper';
import Paper from 'material-ui/Paper';
import Typography from 'material-ui/Typography';

class DepositDialog extends React.Component {
    constructor (props) {
        super (props);

    }

    state = {
        open: false,
        deal: {},
        deposit: {}
    };

    componentWillReceiveProps (nextProps) {
        this.setState ({ open: nextProps.open });
        this.setState ({ deal: nextProps.deal });
        this.setState ({ deposit: { amount: nextProps.deal.deposit } })
    }

    handleMakeDeposit = () => {
        this.props.makeDeposit (this.state.deal, this.state.deposit);
        this.setState ({ open: false });
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

    getSteps = () => {
        return ['Enter destination address', 'Secure encryption', 'Send computation fee', 'Send deposit and gas'];
    };

    getStepContent = (step) => {
        switch (step) {
            case 0:
                return <div>
                    You are about to make a deposit. Enter your destination
                    address. It will be immediately encrypted and
                    will never leave this computer.
                    <div style={{ paddingTop: '20px', paddingBottom: '20px' }}>
                        <TextField
                            name="amount"
                            onChange={this.updateDepositState.bind (this)}
                            label="Amount..."
                            disabled
                            value={this.state.deposit.amount}
                        />
                        <TextField
                            style={{ width: '250px' }}
                            name="destinationAddress"
                            onChange={this.updateDepositState.bind (this)}
                            label="Destination Address..."
                        />
                    </div>
                </div>;
            case 1:
                return <p>Encrypting destination address</p>;
            case 2:
                return <p>An ad group contains one or more ads which target a
                    shared set of keywords.</p>;
            case 3:
                return <p>Try out different ad text to see what brings in the
                    most customers, and learn how to enhance your ads using
                    features like ad extensions.
                    If you run into any problems with your ads, find out how to
                    tell if they're running and how to resolve approval
                    issues.</p>;
            default:
                return <p>Unknown step</p>;
        }
    };

    handleNext = () => {
        this.setState ({
            activeStep: this.state.activeStep + 1,
        });
    };

    handleBack = () => {
        this.setState ({
            activeStep: this.state.activeStep - 1,
        });
    };

    handleReset = () => {
        this.setState ({
            activeStep: 0,
        });
    };

    render () {
        const steps = this.getSteps ();
        const { activeStep } = this.state;
        return (
            <Dialog
                open={this.state.open}
                onClose={evt => this.handleClose ()}
            >
                <DialogTitle> Make Deposit </DialogTitle>
                <DialogContent>
                    <Stepper activeStep={activeStep} orientation="vertical">
                        {steps.map ((label, index) => {
                            return (
                                <Step key={label}>
                                    <StepLabel>{label}</StepLabel>
                                    <StepContent>
                                        <div>{this.getStepContent (index)}</div>
                                        <div>
                                            <div>
                                                <Button
                                                    disabled={activeStep === 0}
                                                    onClick={this.handleBack}
                                                >
                                                    Back
                                                </Button>
                                                <Button
                                                    variant="raised"
                                                    color="primary"
                                                    onClick={this.handleNext}
                                                >
                                                    {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
                                                </Button>
                                            </div>
                                        </div>
                                    </StepContent>
                                </Step>
                            );
                        })}
                    </Stepper>
                    {activeStep === steps.length && (
                        <Paper square elevation={0}>
                            <Typography>All steps completed - you&quot;re
                                finished</Typography>
                            <Button onClick={this.handleReset}>
                                Reset
                            </Button>
                        </Paper>
                    )}

                </DialogContent>
                {/*<DialogActions>*/}
                {/*<Button onClick={this.handleClose} color="primary">*/}
                {/*Cancel*/}
                {/*</Button>*/}
                {/*<Button onClick={this.handleMakeDeposit} color="primary">*/}
                {/*Make Deposit*/}
                {/*</Button>*/}
                {/*</DialogActions>*/}
            </Dialog>
        )
    };
}

export default DepositDialog;
