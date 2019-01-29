pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

import { EnigmaCommon } from "./EnigmaCommon.sol";
import { EnigmaState } from "./EnigmaState.sol";
import "../utils/SolRsaVerify.sol";

/**
 * @author Enigma
 *
 * Library that maintains functionality associated with secret contracts
 */
library SecretContractImpl {
    using SafeMath for uint256;
    using ECDSA for bytes32;

    function countStateDeltasImpl(EnigmaState.State storage state, bytes32 _scAddr)
    public
    view
    returns (uint)
    {
        return state.contracts[_scAddr].stateDeltaHashes.length;
    }

    function isDeployedImpl(EnigmaState.State storage state, bytes32 _scAddr)
    public
    view
    returns (bool)
    {
        if (state.contracts[_scAddr].status == EnigmaCommon.SecretContractStatus.Deployed) {
            return true;
        } else {
            return false;
        }
    }

    function getStateDeltaHashImpl(EnigmaState.State storage state, bytes32 _scAddr, uint _index)
    public
    view
    returns (bytes32)
    {
        return state.contracts[_scAddr].stateDeltaHashes[_index];
    }

    function getStateDeltaHashesImpl(EnigmaState.State storage state, bytes32 _scAddr, uint _start, uint _stop)
    public
    view
    returns (bytes32[] memory)
    {
        if (_stop == 0) {
            _stop = state.contracts[_scAddr].stateDeltaHashes.length;
        }
        bytes32[] memory deltas = new bytes32[](_stop.sub(_start));
        uint pos = 0;
        for (uint i = _start; i < _stop; i++) {
            deltas[pos] = state.contracts[_scAddr].stateDeltaHashes[i];
            pos++;
        }
        return deltas;
    }

    function isValidDeltaHashImpl(EnigmaState.State storage state, bytes32 _scAddr, bytes32 _stateDeltaHash)
    public
    view
    returns (bool)
    {
        bool valid = false;
        for (uint i = 0; i < state.contracts[_scAddr].stateDeltaHashes.length; i++) {
            if (state.contracts[_scAddr].stateDeltaHashes[i] == _stateDeltaHash) {
                valid = true;
                break;
            }
        }
        return valid;
    }

    function countSecretContractsImpl(EnigmaState.State storage state)
    public
    view
    returns (uint)
    {
        return state.scAddresses.length;
    }

    function getSecretContractAddressesImpl(EnigmaState.State storage state, uint _start, uint _stop)
    public
    view
    returns (bytes32[] memory)
    {
        if (_stop == 0) {
            _stop = state.scAddresses.length;
        }
        bytes32[] memory addresses = new bytes32[](_stop.sub(_start));
        uint pos = 0;
        for (uint i = _start; i < _stop; i++) {
            addresses[pos] = state.scAddresses[i];
            pos++;
        }
        return addresses;
    }

}
