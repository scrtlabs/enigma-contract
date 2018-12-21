pragma solidity ^0.5.0;

contract Billionare {
    string winner;
    function check(
        string n_one,
        uint one,
        string n_two,
        uint two,
        string n_three,
        uint three
    )
        public
        pure
        returns (string)
    {
        string memory max = n_one;
        if (two >= one && two >= three) {
            max = n_two;
        }
        if (three >= two && three >= one) {
            max = n_three;
        }

        return max;
    }

    function commit(string name) public {
        winner = name;
    }

    function get_winner() public view returns(string) {
        return winner;
    }

    function clear_winner() public returns(uint) {
        delete winner;
        return 0;
    }
}