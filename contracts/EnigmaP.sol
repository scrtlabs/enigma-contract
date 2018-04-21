pragma solidity ^0.4.22;

contract EnigmaP {

    function EnigmaP() public {
    }

    function addArg(bytes32[] args, bytes32 arg, uint offset, uint value) pure returns (uint){
        // Add a uint value to the computation argument
        args[offset] = arg;
        offset++;

        args[offset] = uintToBytes(value);
        offset++;
        return offset;
    }

    function addEncryptedArg(bytes32[] args, bytes32 arg, uint offset, bytes32[] value) pure returns (uint){
        // Add addresses values to the computation argument
        args[offset] = arg;
        offset++;

        for (uint i = 0; i < value.length; i++) {
            args[offset] = value[i];
            offset++;
        }
        return offset;
    }

    function uintToBytes(uint v) private pure returns (bytes32 ret) {
        // Serialize bytes to int
        // TODO: optimize with assembly if possible
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