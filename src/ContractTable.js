import React from 'react';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import {withStyles} from 'material-ui/styles';
import Table, {
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TablePagination,
    TableRow,
    TableSortLabel,
} from 'material-ui/Table';
import Toolbar from 'material-ui/Toolbar';
import Typography from 'material-ui/Typography';
import Paper from 'material-ui/Paper';
import Checkbox from 'material-ui/Checkbox';
import IconButton from 'material-ui/IconButton';
import Tooltip from 'material-ui/Tooltip';
import MoreVertIcon from 'material-ui-icons/MoreVert';
import FilterListIcon from 'material-ui-icons/FilterList';
import {lighten} from 'material-ui/styles/colorManipulator';


const columnData = [
    { id: 'name', numeric: false, disablePadding: true, label: 'Name' },
    { id: 'address', numeric: false, disablePadding: true, label: 'Address' },
    {
        id: 'eng',
        numeric: true,
        disablePadding: false,
        label: 'Credit (ENG)'
    },
    {
        id: 'eth',
        numeric: true,
        disablePadding: false,
        label: 'Credit (ETH)'
    },
];

class ContractTableHead extends React.Component {
    createSortHandler = property => event => {
        this.props.onRequestSort (event, property);
    };

    render () {
        const { onSelectAllClick, order, orderBy, numSelected, rowCount } = this.props;

        return (
            <TableHead>
                <TableRow>
                    <TableCell padding="checkbox">
                        <Checkbox
                            indeterminate={numSelected > 0 && numSelected < rowCount}
                            checked={numSelected === rowCount}
                            onChange={onSelectAllClick}
                        />
                    </TableCell>
                    {columnData.map (column => {
                        return (
                            <TableCell
                                key={column.id}
                                numeric={column.numeric}
                                padding={column.disablePadding ? 'none' : 'default'}
                                sortDirection={orderBy === column.id ? order : false}
                            >
                                <Tooltip
                                    title="Sort"
                                    placement={column.numeric ? 'bottom-end' : 'bottom-start'}
                                    enterDelay={300}
                                >
                                    <TableSortLabel
                                        active={orderBy === column.id}
                                        direction={order}
                                        onClick={this.createSortHandler (column.id)}
                                    >
                                        {column.label}
                                    </TableSortLabel>
                                </Tooltip>
                            </TableCell>
                        );
                    }, this)}
                </TableRow>
            </TableHead>
        );
    }
}

ContractTableHead.propTypes = {
    numSelected: PropTypes.number.isRequired,
    onRequestSort: PropTypes.func.isRequired,
    onSelectAllClick: PropTypes.func.isRequired,
    order: PropTypes.string.isRequired,
    orderBy: PropTypes.string.isRequired,
    rowCount: PropTypes.number.isRequired,
};

const toolbarStyles = theme => ({
    root: {
        paddingRight: theme.spacing.unit,
    },
    highlight:
        theme.palette.type === 'light'
            ? {
                color: theme.palette.secondary.main,
                backgroundColor: lighten (theme.palette.secondary.light, 0.85),
            }
            : {
                color: theme.palette.text.primary,
                backgroundColor: theme.palette.secondary.dark,
            },
    spacer: {
        flex: '1 1 100%',
    },
    actions: {
        color: theme.palette.text.secondary,
    },
    title: {
        flex: '0 0 auto',
    },
});

let ContractTableToolbar = props => {
    const { numSelected, classes } = props;

    return (
        <Toolbar
            className={classNames (classes.root, {
                [classes.highlight]: numSelected > 0,
            })}
        >
            <div className={classes.title}>
                {numSelected > 0 ? (
                    <Typography color="inherit" variant="subheading">
                        {numSelected} selected
                    </Typography>
                ) : (
                    <Typography variant="title">Contracts</Typography>
                )}
            </div>
            <div className={classes.spacer}/>
            <div className={classes.actions}>
                {numSelected > 0 ? (
                    <Tooltip title="Actions">
                        <IconButton aria-label="Actions">
                            <MoreVertIcon/>
                        </IconButton>
                    </Tooltip>
                ) : (
                    <Tooltip title="Filter list">
                        <IconButton aria-label="Filter list">
                            <FilterListIcon/>
                        </IconButton>
                    </Tooltip>
                )}
            </div>
        </Toolbar>
    );
};

ContractTableToolbar.propTypes = {
    classes: PropTypes.object.isRequired,
    numSelected: PropTypes.number.isRequired,
};

ContractTableToolbar = withStyles (toolbarStyles) (ContractTableToolbar);

const styles = theme => ({
    root: {
        width: '100%',
        marginTop: theme.spacing.unit * 3,
        height: '240px',
        overflow: 'hidden'
    },
    table: {
        minWidth: 800,
        height: '100%'
    },
    tableWrapper: {
        overflowX: 'auto',
    },
});

class ContractTable extends React.Component {
    constructor (props, context) {
        super (props, context);

        this.state = {
            order: 'asc',
            orderBy: 'calories',
            selected: [],
            data: [],
            page: 0,
            rowsPerPage: 5,
        };
    }

    componentWillReceiveProps (nextProps) {
        this.setState ({ data: nextProps.data });
    }

    handleRequestSort = (event, property) => {
        const orderBy = property;
        let order = 'desc';

        if (this.state.orderBy === property && this.state.order === 'desc') {
            order = 'asc';
        }

        const data =
            order === 'desc'
                ? this.state.data.sort ((a, b) => (b[orderBy] < a[orderBy] ? -1 : 1))
                : this.state.data.sort ((a, b) => (a[orderBy] < b[orderBy] ? -1 : 1));

        this.setState ({ data, order, orderBy });
    };

    handleSelectAllClick = (event, checked) => {
        if (checked) {
            this.setState ({ selected: this.state.data.map (n => n.id) });
            return;
        }
        this.setState ({ selected: [] });
    };

    handleClick = (event, id) => {
        const { selected } = this.state;
        const selectedIndex = selected.indexOf (id);
        let newSelected = [];

        if (selectedIndex === -1) {
            newSelected = newSelected.concat (selected, id);
        } else if (selectedIndex === 0) {
            newSelected = newSelected.concat (selected.slice (1));
        } else if (selectedIndex === selected.length - 1) {
            newSelected = newSelected.concat (selected.slice (0, -1));
        } else if (selectedIndex > 0) {
            newSelected = newSelected.concat (
                selected.slice (0, selectedIndex),
                selected.slice (selectedIndex + 1),
            );
        }

        this.setState ({ selected: newSelected }, () => this.props.onSelect (newSelected));
    };

    isSelected = id => this.state.selected.indexOf (id) !== -1;

    render () {
        const { classes } = this.props;
        const { data, order, orderBy, selected, rowsPerPage, page } = this.state;
        const emptyRows = rowsPerPage - Math.min (rowsPerPage, data.length - page * rowsPerPage);

        return (
            <Paper className={classes.root}>
                <ContractTableToolbar numSelected={selected.length}/>
                <div className={classes.tableWrapper}>
                    <Table className={classes.table}>
                        <ContractTableHead
                            numSelected={selected.length}
                            order={order}
                            orderBy={orderBy}
                            onSelectAllClick={this.handleSelectAllClick}
                            onRequestSort={this.handleRequestSort}
                            rowCount={data.length}
                        />
                        <TableBody>
                            {data.slice (page * rowsPerPage, page * rowsPerPage + rowsPerPage).map (n => {
                                const isSelected = this.isSelected (n.id);
                                return (
                                    <TableRow
                                        hover
                                        onClick={event => this.handleClick (event, n.id)}
                                        role="checkbox"
                                        aria-checked={isSelected}
                                        tabIndex={-1}
                                        key={n.id}
                                        selected={isSelected}
                                    >
                                        <TableCell padding="checkbox">
                                            <Checkbox checked={isSelected}/>
                                        </TableCell>
                                        <TableCell
                                            padding="none">{n.name}</TableCell>
                                        <TableCell
                                            padding="none">{n.address}</TableCell>
                                        <TableCell numeric>{n.eng}</TableCell>
                                        <TableCell numeric>{n.eth}</TableCell>
                                    </TableRow>
                                );
                            })}
                            {emptyRows > 0 && (
                                <TableRow style={{ height: 49 * emptyRows }}>
                                    <TableCell colSpan={6}/>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Paper>
        );
    }
}

ContractTable.propTypes = {
    classes: PropTypes.object.isRequired,
};

export default withStyles (styles) (ContractTable);
