import React from 'react';
import Table, {
    TableBody,
    TableCell,
    TableHead,
    TableRow
} from 'material-ui/Table';
import Paper from 'material-ui/Paper';
import FilterListIcon from 'material-ui-icons/FilterList';
import AddIcon from 'material-ui-icons/Add';
import Typography from "material-ui/Typography";
import IconButton from "material-ui/IconButton";
import Toolbar from "material-ui/Toolbar";
import Menu, {MenuItem} from 'material-ui/Menu';

const FILTER_LABELS = [
    'Open Deals',
    'My Deals',
    'All Deals'
];

class DealTable extends React.Component {
    constructor (props) {
        super (props);

    }

    state = {
        deals: [],
        anchorEl: null,
        selectedIndex: 0
    };

    componentWillReceiveProps (nextProps) {
        this.setState ({ deals: nextProps.deals });
        this.setState ({ selectedIndex: nextProps.selectedIndex });
    }

    handleSelectDeals = (event, dealId) => {
        this.props.selectDeal (dealId);
    };

    handleFilter = event => {
        this.setState ({ anchorEl: event.currentTarget });
    };

    handleOrganizeDeal = event => {
        this.props.organizeDeal ();
    };

    handleSelectFilter = (event, index) => {
        console.log ('selecting deals filter', index);
        this.setState ({ selectedIndex: index, anchorEl: null });
        this.props.selectFilter (index);
    };

    handleCloseFilter = event => {
        this.setState ({ anchorEl: null });
    };

    getFilterLabel = index => {
        return FILTER_LABELS[index];
    };

    render () {
        const { anchorEl } = this.state;

        return (
            <Paper>
                <Toolbar style={{
                    display: 'flex',
                    flexDirection: 'row'
                }}>
                    <Typography variant="title" style={{ flex: 1 }}
                                color="inherit">
                        {this.getFilterLabel (this.state.selectedIndex)}
                    </Typography>

                    <IconButton
                        aria-label="Filter Deals"
                        onClick={this.handleFilter}
                    >
                        <FilterListIcon/>
                    </IconButton>
                    <IconButton
                        aria-label="Organize Deal"
                        onClick={this.handleOrganizeDeal}
                    >
                        <AddIcon/>
                    </IconButton>
                    <Menu
                        id="filter-menu"
                        anchorEl={anchorEl}
                        open={Boolean (anchorEl)}
                        onClose={this.handleCloseFilter}
                    >
                        <MenuItem
                            key={0}
                            selected={0 === this.state.selectedIndex}
                            onClick={event => this.handleSelectFilter (event, 0)}
                        >
                            Open Deals
                        </MenuItem>
                        <MenuItem
                            key={1}
                            selected={1 === this.state.selectedIndex}
                            onClick={event => this.handleSelectFilter (event, 1)}
                        >
                            My Deals
                        </MenuItem>
                        <MenuItem
                            key={2}
                            selected={2 === this.state.selectedIndex}
                            onClick={event => this.handleSelectFilter (event, 2)}
                        >
                            All Deals
                        </MenuItem>
                    </Menu>
                </Toolbar>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Title</TableCell>
                            <TableCell numeric>Participants</TableCell>
                            <TableCell numeric>Deposits</TableCell>
                            <TableCell numeric>Deposit (ETH)</TableCell>
                            <TableCell numeric>Places Left</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {this.state.deals.map (deal => {
                            return (
                                <TableRow key={deal.id}
                                          hover
                                          style={{ cursor: 'pointer' }}
                                          onClick={event => this.handleSelectDeals (event, deal.id)}>
                                    <TableCell>{deal.title}</TableCell>
                                    <TableCell
                                        numeric>{deal.numParticipants}</TableCell>
                                    <TableCell
                                        numeric>{deal.numDeposits}</TableCell>
                                    <TableCell
                                        numeric>{deal.deposit}</TableCell>
                                    <TableCell
                                        numeric>{deal.numDestAddresses - deal.numDeposits}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Paper>
        );
    }
}


export default DealTable;