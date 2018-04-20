pragma solidity ^0.4.22;

contract EnigmaP {

    function EnigmaP() public {
    }

    function addUintArg(bytes32[] args, uint position, uint value) {
        // Add a uint value to the computation argument
        args[position] = uintToBytes(value);
    }

    function addBytes32Arg(bytes32[] args, uint position, bytes32[] value) {
        // Add addresses values to the computation argument
        for (uint i = 0; i < value.length; i++) {
            args[position] = value[i];
        }
    }

    function uintToBytes(uint v) private pure returns (bytes32 ret) {
        // Serialize bytes to int
        if (v == 0) {
            ret = '0';
        }
        else {
            while (v > 0) {
                ret = bytes32(uint(ret) / (2 ** 8));
                ret |= bytes32(((v % 10) + 48) * 2 ** (8 * 31));
                v /= 10;
            }
        }
        return ret;
    }
}