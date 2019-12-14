pragma solidity ^0.5.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract ExchangeRate is Ownable {

    uint exchangeRate;

    constructor() public {

    }

    function getExchangeRate() public view returns (uint256) {
        return exchangeRate;
    }

    function setExchangeRate(uint _exchangeRate) public onlyOwner {
        exchangeRate = _exchangeRate;
    }
}
