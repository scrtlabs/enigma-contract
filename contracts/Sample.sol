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

    function setStateVarGasFail(uint _stateInt, bool _stateBool) public {
        for (uint i = 0; i < 1000000; i++) {
            stateInt = i;
            stateBool = (i % 2 == 0);
        }
    }

    function setStateVarRevert(uint _stateInt, bool _stateBool) public {
        stateInt = _stateInt;
        stateBool = _stateBool;
        require(false, "Failed in eth call");
    }

    function incrementCounter() public {
        counter++;
    }
}
