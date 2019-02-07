pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

contract Sample {
    uint public stateInt;
    bool public stateBool;
    uint public counter;

    constructor() public {
        stateInt = 1;
        stateBool = false;
    }

    function setStateVar(uint _stateInt, bool _stateBool) public {
        stateInt = _stateInt;
        stateBool = _stateBool;
    }

    function incrementCounter() public {
        counter++;
    }
}
