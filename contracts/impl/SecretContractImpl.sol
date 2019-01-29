pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "../utils/SolRsaVerify.sol";

import { EnigmaCommon } from "./EnigmaCommon.sol";
import { EnigmaState } from "./EnigmaState.sol";

library SecretContractImpl {
    using SafeMath for uint256;
    using ECDSA for bytes32;

    /**
    * Count state deltas for a deployed secret contract
    *
    * @param _scAddr Secret contract address
    * @return Number of state deltas for deployed secret contract
    */
    function countStateDeltasImpl(EnigmaState.State storage state, bytes32 _scAddr)
    public
    view
    returns (uint)
    {
        return state.contracts[_scAddr].stateDeltaHashes.length;
    }


    /**
    * Check if secret contract has been deployed
    *
    * @param _scAddr Secret contract address
    * @return  true/false
    */
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

    /**
    * Obtain state delta hash for a deployed secret contract at a particular index
    *
    * @param _scAddr Secret contract address
    * @param _index Index in list of state deltas
    * @return State delta hash
    */
    function getStateDeltaHashImpl(EnigmaState.State storage state, bytes32 _scAddr, uint _index)
    public
    view
    returns (bytes32)
    {
        return state.contracts[_scAddr].stateDeltaHashes[_index];
    }

    /**
    * Obtain state delta hashes for a deployed secret contract within a range
    *
    * @param _start Start of range
    * @param _stop End of range
    * @return Subset of state delta hashes for deployed secret contract
    */
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

    /**
    * Check if particular state delta hash for a deployed secret contract is valid
    *
    * @param _scAddr Secret contract address
    * @param _stateDeltaHash State delta hash
    * @return true/false
    */
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
}
