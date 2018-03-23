pragma solidity ^0.4.19;

import "./Enigma.sol";

contract EnigmaLib {
    enum ReturnValue {Ok, Error}
    // The generic Enigma computation event
    event SecretCall(bytes32 callable, bytes32[] callableArgs, bytes32 callback, uint max_cost, bool _success);

    Enigma enigma;

    function EnigmaLib() public {
        enigma = Enigma(0x8acee021a27779d8e98b9650722676b850b25e11);
    }

    // Calls the Enigma computation
    function compute(bytes32 callable, bytes32[] callableArgs, bytes32 callback, uint max_cost) public payable returns (ReturnValue) {
        enigma.handleDeposit.value(msg.value)(msg.sender, 0x345ca3e014aaf5dca488057592ee47305d9b3e10);
        SecretCall(callable, callableArgs, callback, max_cost, true);

        return ReturnValue.Ok;
    }
}
