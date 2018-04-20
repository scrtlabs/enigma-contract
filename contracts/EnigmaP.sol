pragma solidity ^0.4.16;

/**
 * @title BytesToTypes
 * @dev The BytesToTypes contract converts the memory byte arrays to the standard solidity types
 * @author pouladzade@gmail.com
 */

contract BytesToTypes {


    function bytesToAddress(uint _offst, bytes memory _input) internal pure returns (address _output) {

        assembly {
            _output := mload(add(_input, _offst))
        }
    }

    function bytesToBool(uint _offst, bytes memory _input) internal pure returns (bool _output) {

        uint8 x;
        assembly {
            x := mload(add(_input, _offst))
        }
        x==0 ? _output = false : _output = true;
    }

    function getStringSize(uint _offst, bytes memory _input) internal pure returns(uint size){

        assembly{

            size := mload(add(_input,_offst))
            let chunk_count := add(div(size,32),1) // chunk_count = size/32 + 1

        if gt(mod(size,32),0) {// if size%32 > 0
        chunk_count := add(chunk_count,1)
        }

    size := mul(chunk_count,32)// first 32 bytes reseves for size in strings
    }
}

function bytesToString(uint _offst, bytes memory _input, bytes memory _output) internal  {

uint size = 32;
assembly {
let loop_index:= 0

let chunk_count

size := mload(add(_input,_offst))
chunk_count := add(div(size,32),1) // chunk_count = size/32 + 1

if gt(mod(size,32),0) {
chunk_count := add(chunk_count,1)  // chunk_count++
}


loop:
mstore(add(_output,mul(loop_index,32)),mload(add(_input,_offst)))
_offst := sub(_offst,32)           // _offst -= 32
loop_index := add(loop_index,1)

jumpi(loop , lt(loop_index , chunk_count))

}
}

function bytesToBytes32(uint _offst, bytes memory  _input, bytes32 _output) internal pure {

assembly {
mstore(_output , add(_input, _offst))
mstore(add(_output,32) , add(add(_input, _offst),32))
}
}

function bytesToInt8(uint _offst, bytes memory  _input) internal pure returns (int8 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt16(uint _offst, bytes memory _input) internal pure returns (int16 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt24(uint _offst, bytes memory _input) internal pure returns (int24 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt32(uint _offst, bytes memory _input) internal pure returns (int32 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt40(uint _offst, bytes memory _input) internal pure returns (int40 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt48(uint _offst, bytes memory _input) internal pure returns (int48 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt56(uint _offst, bytes memory _input) internal pure returns (int56 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt64(uint _offst, bytes memory _input) internal pure returns (int64 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt72(uint _offst, bytes memory _input) internal pure returns (int72 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt80(uint _offst, bytes memory _input) internal pure returns (int80 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt88(uint _offst, bytes memory _input) internal pure returns (int88 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt96(uint _offst, bytes memory _input) internal pure returns (int96 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt104(uint _offst, bytes memory _input) internal pure returns (int104 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt112(uint _offst, bytes memory _input) internal pure returns (int112 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt120(uint _offst, bytes memory _input) internal pure returns (int120 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt128(uint _offst, bytes memory _input) internal pure returns (int128 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt136(uint _offst, bytes memory _input) internal pure returns (int136 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt144(uint _offst, bytes memory _input) internal pure returns (int144 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt152(uint _offst, bytes memory _input) internal pure returns (int152 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt160(uint _offst, bytes memory _input) internal pure returns (int160 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt168(uint _offst, bytes memory _input) internal pure returns (int168 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt176(uint _offst, bytes memory _input) internal pure returns (int176 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt184(uint _offst, bytes memory _input) internal pure returns (int184 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt192(uint _offst, bytes memory _input) internal pure returns (int192 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt200(uint _offst, bytes memory _input) internal pure returns (int200 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt208(uint _offst, bytes memory _input) internal pure returns (int208 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt216(uint _offst, bytes memory _input) internal pure returns (int216 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt224(uint _offst, bytes memory _input) internal pure returns (int224 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt232(uint _offst, bytes memory _input) internal pure returns (int232 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt240(uint _offst, bytes memory _input) internal pure returns (int240 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt248(uint _offst, bytes memory _input) internal pure returns (int248 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToInt256(uint _offst, bytes memory _input) internal pure returns (int256 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint8(uint _offst, bytes memory _input) internal pure returns (uint8 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint16(uint _offst, bytes memory _input) internal pure returns (uint16 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint24(uint _offst, bytes memory _input) internal pure returns (uint24 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint32(uint _offst, bytes memory _input) internal pure returns (uint32 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint40(uint _offst, bytes memory _input) internal pure returns (uint40 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint48(uint _offst, bytes memory _input) internal pure returns (uint48 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint56(uint _offst, bytes memory _input) internal pure returns (uint56 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint64(uint _offst, bytes memory _input) internal pure returns (uint64 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint72(uint _offst, bytes memory _input) internal pure returns (uint72 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint80(uint _offst, bytes memory _input) internal pure returns (uint80 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint88(uint _offst, bytes memory _input) internal pure returns (uint88 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint96(uint _offst, bytes memory _input) internal pure returns (uint96 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint104(uint _offst, bytes memory _input) internal pure returns (uint104 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint112(uint _offst, bytes memory _input) internal pure returns (uint112 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint120(uint _offst, bytes memory _input) internal pure returns (uint120 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint128(uint _offst, bytes memory _input) internal pure returns (uint128 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint136(uint _offst, bytes memory _input) internal pure returns (uint136 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint144(uint _offst, bytes memory _input) internal pure returns (uint144 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint152(uint _offst, bytes memory _input) internal pure returns (uint152 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint160(uint _offst, bytes memory _input) internal pure returns (uint160 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint168(uint _offst, bytes memory _input) internal pure returns (uint168 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint176(uint _offst, bytes memory _input) internal pure returns (uint176 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint184(uint _offst, bytes memory _input) internal pure returns (uint184 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint192(uint _offst, bytes memory _input) internal pure returns (uint192 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint200(uint _offst, bytes memory _input) internal pure returns (uint200 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint208(uint _offst, bytes memory _input) internal pure returns (uint208 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint216(uint _offst, bytes memory _input) internal pure returns (uint216 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint224(uint _offst, bytes memory _input) internal pure returns (uint224 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint232(uint _offst, bytes memory _input) internal pure returns (uint232 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint240(uint _offst, bytes memory _input) internal pure returns (uint240 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint248(uint _offst, bytes memory _input) internal pure returns (uint248 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

function bytesToUint256(uint _offst, bytes memory _input) internal pure returns (uint256 _output) {

assembly {
_output := mload(add(_input, _offst))
}
}

}

contract  SizeOf {

function sizeOfString(string _in) internal pure  returns(uint _size){
_size = bytes(_in).length / 32;
if(bytes(_in).length % 32 != 0)
_size++;

_size++; // first 32 bytes is reserved for the size of the string
_size *= 32;
}

function sizeOfInt(uint16 _postfix) internal pure  returns(uint size){

assembly{
switch _postfix
case 8 { size := 1 }
case 16 { size := 2 }
case 24 { size := 3 }
case 32 { size := 4 }
case 40 { size := 5 }
case 48 { size := 6 }
case 56 { size := 7 }
case 64 { size := 8 }
case 72 { size := 9 }
case 80 { size := 10 }
case 88 { size := 11 }
case 96 { size := 12 }
case 104 { size := 13 }
case 112 { size := 14 }
case 120 { size := 15 }
case 128 { size := 16 }
case 136 { size := 17 }
case 144 { size := 18 }
case 152 { size := 19 }
case 160 { size := 20 }
case 168 { size := 21 }
case 176 { size := 22 }
case 184 { size := 23 }
case 192 { size := 24 }
case 200 { size := 25 }
case 208 { size := 26 }
case 216 { size := 27 }
case 224 { size := 28 }
case 232 { size := 29 }
case 240 { size := 30 }
case 248 { size := 31 }
case 256 { size := 32 }
default  { size := 32 }
}

}

function sizeOfUint(uint16 _postfix) internal pure  returns(uint size){
return sizeOfInt(_postfix);
}

function sizeOfAddress() internal pure  returns(uint8){
return 20;
}

function sizeOfBool() internal pure  returns(uint8){
return 1;
}


}

contract TypesToBytes {

function TypesToBytes() internal {

}
function addressToBytes(uint _offst, address _input, bytes memory _output) internal pure {

assembly {
mstore(add(_output, _offst), _input)
}
}

function bytes32ToBytes(uint _offst, bytes32 _input, bytes memory _output) internal pure {

assembly {
mstore(add(_output, _offst), _input)
mstore(add(add(_output, _offst),32), add(_input,32))
}
}

function boolToBytes(uint _offst, bool _input, bytes memory _output) internal pure {
uint8 x = _input == false ? 0 : 1;
assembly {
mstore(add(_output, _offst), x)
}
}

function stringToBytes(uint _offst, bytes memory _input, bytes memory _output) internal {
uint256 stack_size = _input.length / 32;
if(_input.length % 32 > 0) stack_size++;

assembly {
let index := 0
stack_size := add(stack_size,1)//adding because of 32 first bytes memory as the length
loop:

mstore(add(_output, _offst), mload(add(_input,mul(index,32))))
_offst := sub(_offst , 32)
index := add(index ,1)
jumpi(loop , lt(index,stack_size))
}
}

function intToBytes(uint _offst, int _input, bytes memory  _output) internal pure {

assembly {
mstore(add(_output, _offst), _input)
}
}

function uintToBytes(uint _offst, uint _input, bytes memory _output) internal pure {

assembly {
mstore(add(_output, _offst), _input)
}
}

}

contract EnigmaP is BytesToTypes, TypesToBytes, SizeOf {

function EnigmaP() public {

}
}