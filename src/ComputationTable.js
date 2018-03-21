import React from 'react';
import PropTypes from 'prop-types';
import {withStyles} from 'material-ui/styles';
import Table, {
    TableBody,
    TableCell,
    TableFooter,
    TablePagination,
    TableRow,
    TableHead
} from 'material-ui/Table';
import Paper from 'material-ui/Paper';
import IconButton from 'material-ui/IconButton';
import FirstPageIcon from 'material-ui-icons/FirstPage';
import CheckCircleIcon from 'material-ui-icons/CheckCircle';
import KeyboardArrowLeft from 'material-ui-icons/KeyboardArrowLeft';
import KeyboardArrowRight from 'material-ui-icons/KeyboardArrowRight';
import LastPageIcon from 'material-ui-icons/LastPage';
import {CircularProgress} from 'material-ui/Progress';


const actionsStyles = theme => ({
    root: {
        flexShrink: 0,
        color: theme.palette.text.secondary,
        marginLeft: theme.spacing.unit * 2.5,
    },
});

class TablePaginationActions extends React.Component {
    handleFirstPageButtonClick = event => {
        this.props.onChangePage (event, 0);
    };

    handleBackButtonClick = event => {
        this.props.onChangePage (event, this.props.page - 1);
    };

    handleNextButtonClick = event => {
        this.props.onChangePage (event, this.props.page + 1);
    };

    handleLastPageButtonClick = event => {
        this.props.onChangePage (
            event,
            Math.max (0, Math.ceil (this.props.count / this.props.rowsPerPage) - 1),
        );
    };

    render () {
        const { classes, count, page, rowsPerPage, theme } = this.props;

        return (
            <div className={classes.root}>
                <IconButton
                    onClick={this.handleFirstPageButtonClick}
                    disabled={page === 0}
                    aria-label="First Page"
                >
                    {theme.direction === 'rtl' ? <LastPageIcon/> :
                        <FirstPageIcon/>}
                </IconButton>
                <IconButton
                    onClick={this.handleBackButtonClick}
                    disabled={page === 0}
                    aria-label="Previous Page"
                >
                    {theme.direction === 'rtl' ? <KeyboardArrowRight/> :
                        <KeyboardArrowLeft/>}
                </IconButton>
                <IconButton
                    onClick={this.handleNextButtonClick}
                    disabled={page >= Math.ceil (count / rowsPerPage) - 1}
                    aria-label="Next Page"
                >
                    {theme.direction === 'rtl' ? <KeyboardArrowLeft/> :
                        <KeyboardArrowRight/>}
                </IconButton>
                <IconButton
                    onClick={this.handleLastPageButtonClick}
                    disabled={page >= Math.ceil (count / rowsPerPage) - 1}
                    aria-label="Last Page"
                >
                    {theme.direction === 'rtl' ? <FirstPageIcon/> :
                        <LastPageIcon/>}
                </IconButton>
            </div>
        );
    }
}

TablePaginationActions.propTypes = {
    classes: PropTypes.object.isRequired,
    count: PropTypes.number.isRequired,
    onChangePage: PropTypes.func.isRequired,
    page: PropTypes.number.isRequired,
    rowsPerPage: PropTypes.number.isRequired,
    theme: PropTypes.object.isRequired,
};

const TablePaginationActionsWrapped = withStyles (actionsStyles, { withTheme: true }) (
    TablePaginationActions,
);


const styles = theme => ({
    root: {
        width: '100%',
        marginTop: theme.spacing.unit * 3,
    },
    table: {
        minWidth: 500,
    },
    tableWrapper: {
        overflowX: 'auto',
    },
});

class ComputationTable extends React.Component {
    constructor (props, context) {
        super (props, context);

        this.state = {
            data: [],
            page: 0,
            rowsPerPage: 5,
            chainEvents: null
        };
    }

    componentWillReceiveProps (nextProps) {
        this.setState ({ data: nextProps.data });
    }

    handleChangePage = (event, page) => {
        this.setState ({ page });
    };

    handleChangeRowsPerPage = event => {
        this.setState ({ rowsPerPage: event.target.value });
    };

    handleCallback = () => {

    };

    handleSign = (event) => {
        this.props.onSign (event);
    };

    getStatusElement = (event, status, validation, validation_req) => {
        let name;
        switch (status) {
            case 1:
                name = <TableCell>Assigned</TableCell>;
                break;
            case 2:
                name = <TableCell>
                    <CircularProgress style={{ float: 'right' }}
                                      variant="static"
                                      value={validation / validation_req * 100}
                                      size={25}
                    />
                </TableCell>;
                break;
            case 3:
                name =
                    <TableCell style={{
                        float: 'right',
                        paddingTop: 0,
                        paddingBottom: 0
                    }}>

                        <IconButton
                            aria-label="Sign"
                            onClick={evt => this.handleSign (event)}
                        >
                            <CheckCircleIcon/>
                        </IconButton>
                    </TableCell>;
                break;
            case 4:
                name = <TableCell>Executed</TableCell>;
                break;
            default:
                name = <TableCell>Pending</TableCell>;
                break;
        }
        return name;
    };

    render () {
        const { classes } = this.props;
        const { data, rowsPerPage, page } = this.state;
        const emptyRows = rowsPerPage - Math.min (rowsPerPage, data.length - page * rowsPerPage);

        return (
            <Paper className={classes.root}>
                <div className={classes.tableWrapper}>
                    <Table className={classes.table}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Block #</TableCell>
                                <TableCell>Callable</TableCell>
                                <TableCell numeric>Status</TableCell>
                                <TableCell>Validation</TableCell>
                                <TableCell numeric>Cost (ENG)</TableCell>
                                <TableCell numeric>Gas (ETH)</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.slice (page * rowsPerPage, page * rowsPerPage + rowsPerPage).map (n => {
                                return (
                                    <TableRow key={n.id}>
                                        <TableCell numeric>
                                            {n.blockNumber}
                                        </TableCell>
                                        <TableCell>{n.callable}</TableCell>
                                        {this.getStatusElement (n, n.status, n.validation, n.validation_req)}
                                        <TableCell>{'(' + n.validation + ' / ' + n.validation_req + ')'}</TableCell>
                                        <TableCell numeric>
                                            {n.cost_eng}
                                        </TableCell>
                                        <TableCell numeric>
                                            {n.cost_eth}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {emptyRows > 0 && (
                                <TableRow style={{ height: 48 * emptyRows }}>
                                    <TableCell colSpan={6}/>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TablePagination
                                    colSpan={7}
                                    count={data.length}
                                    rowsPerPage={rowsPerPage}
                                    page={page}
                                    onChangePage={this.handleChangePage}
                                    onChangeRowsPerPage={this.handleChangeRowsPerPage}
                                    Actions={TablePaginationActionsWrapped}
                                />
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            </Paper>
        );
    }
}

ComputationTable.propTypes = {
    classes: PropTypes.object.isRequired,
};

export default withStyles (styles) (ComputationTable);