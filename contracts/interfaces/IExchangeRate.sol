pragma solidity ^0.5.12;
pragma experimental ABIEncoderV2;

interface IExchangeRate {
    function getExchangeRate() external view returns (uint256);
}
