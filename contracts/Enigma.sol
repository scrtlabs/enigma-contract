pragma solidity ^0.4.19;


contract Enigma {
    enum ReturnValue {Ok, Error}

    struct Account {
        address contractAddress;
        mapping(address => uint) depositEng;
    }

    function makeDeposit(address contractAddress) payable returns (ReturnValue){
    }

    function updateState(address contractAddress, bytes serializedValue, uint computationCost) {

    }
}
