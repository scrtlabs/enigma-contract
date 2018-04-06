pragma solidity ^0.4.19;

import "./Enigma.sol";

contract EnigmaLib {
    enum ReturnValue {Ok, Error}
    // The generic Enigma computation event
    event SecretCall(bytes32 callable, bytes32[] callableArgs, bytes32 callback, uint max_cost, bool _success);

    Enigma enigma;

    function EnigmaLib() public {
        enigma = Enigma(0x8cd918cee8f93989e334bc0107bb33a9586d05c0);
    }

    // Calls the Enigma computation
    function compute(bytes32 callable, bytes32[] callableArgs, bytes32 callback, uint max_cost) public payable returns (ReturnValue) {
//        enigma.handleDeposit.value(msg.value)(address(this), msg.sender);
        SecretCall(callable, callableArgs, callback, max_cost, true);

        return ReturnValue.Ok;
    }

    function random(int start, int ent) {

    }
}
