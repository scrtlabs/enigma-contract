pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../utils/SolRsaVerify.sol";

import { EnigmaCommon } from "./EnigmaCommon.sol";
import { EnigmaState } from "./EnigmaState.sol";

library WorkersImpl {
    using SafeMath for uint256;

    event Registered(address custodian, address signer);
    event DepositSuccessful(address from, uint value);
    event WithdrawSuccessful(address to, uint value);

    function registerImpl(EnigmaState.State storage state, address _signer, bytes memory _report,
        bytes memory _signature)
    public {
        // TODO: consider exit if both signer and custodian are matching
        // If the custodian is not already register, we add an index entry
        EnigmaCommon.Worker storage worker = state.workers[msg.sender];
        if (worker.signer == address(0)) {
            state.workerAddresses.push(msg.sender);
        }
        require(verifyReportImpl(_report, _signature) == 0, "Verifying signature failed");

        // Set the custodian attributes

        worker.signer = _signer;
        worker.balance = 0;
        worker.report = _report;
        worker.status = EnigmaCommon.WorkerStatus.Registered;

        emit Registered(msg.sender, _signer);
    }

    /**
    * The RLP encoded report returned by the IAS server
    *
    * @param _custodian The worker's custodian address
    */
    function getReportImpl(EnigmaState.State storage state, address _custodian)
    public
    view
    returns (address, bytes memory)
    {
        EnigmaCommon.Worker memory worker = state.workers[_custodian];
        // The RLP encoded report and signer's address for the specified worker
        require(worker.signer != address(0), "Worker not registered");
        return (worker.signer, worker.report);
    }

    /**
    * This verifies an IAS report with hard coded modulus and exponent of Intel's certificate.
    * @param _data The report itself
    * @param _signature The signature of the report
    */
    function verifyReportImpl(bytes memory _data, bytes memory _signature)
    public
    view
    returns (uint) {
        /*
        this is the modulus and the exponent of intel's certificate, you can extract it using:
        `openssl x509 -noout -modulus -in intel.cert`
        and `openssl x509 -in intel.cert  -text`
        */
        bytes memory exponent = hex"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010001";
        bytes memory modulus = hex"A97A2DE0E66EA6147C9EE745AC0162686C7192099AFC4B3F040FAD6DE093511D74E802F510D716038157DCAF84F4104BD3FED7E6B8F99C8817FD1FF5B9B864296C3D81FA8F1B729E02D21D72FFEE4CED725EFE74BEA68FBC4D4244286FCDD4BF64406A439A15BCB4CF67754489C423972B4A80DF5C2E7C5BC2DBAF2D42BB7B244F7C95BF92C75D3B33FC5410678A89589D1083DA3ACC459F2704CD99598C275E7C1878E00757E5BDB4E840226C11C0A17FF79C80B15C1DDB5AF21CC2417061FBD2A2DA819ED3B72B7EFAA3BFEBE2805C9B8AC19AA346512D484CFC81941E15F55881CC127E8F7AA12300CD5AFB5742FA1D20CB467A5BEB1C666CF76A368978B5";

        return SolRsaVerify.pkcs1Sha256VerifyRaw(_data, _signature, exponent, modulus);
    }

    /**
    * Login worker. Worker must be registered to do so, and must be logged in at start of epoch to be part of worker
    * selection process.
    */
    function loginImpl(EnigmaState.State storage state) public {
        state.workers[msg.sender].status = EnigmaCommon.WorkerStatus.LoggedIn;
    }

    /**
    * Logout worker. Worker must be logged in to do so.
    */
    function logoutImpl(EnigmaState.State storage state) public {
        state.workers[msg.sender].status = EnigmaCommon.WorkerStatus.LoggedOut;
    }

    /**
    * Deposits ENG stake into contract from worker. Worker must be registered to do so.
    *
    * @param _custodian The worker's ETH address
    * @param _amount The amount of ENG, in grains format (10 ** 8), to deposit
    */
    function depositImpl(EnigmaState.State storage state, address _custodian, uint _amount)
    public
    {
        require(state.engToken.allowance(_custodian, address(this)) >= _amount, "Not enough tokens allowed for transfer");
        require(state.engToken.transferFrom(_custodian, address(this), _amount), "Token transfer failed");

        EnigmaCommon.Worker storage worker = state.workers[_custodian];
        worker.balance = worker.balance.add(_amount);

        emit DepositSuccessful(_custodian, _amount);
    }

    /**
    * Withdraws ENG stake from contract back to worker. Worker must be registered to do so.
    *
    * @param _custodian The worker's ETH address
    * @param _amount The amount of ENG, in grains format (10 ** 8), to deposit
    */
    function withdrawImpl(EnigmaState.State storage state, address _custodian, uint _amount)
    public
    {
        EnigmaCommon.Worker storage worker = state.workers[_custodian];
        require(worker.balance >= _amount, "Not enough tokens in worker balance");
        require(state.engToken.transfer(_custodian, _amount), "Token transfer failed");

        worker.balance = worker.balance.sub(_amount);

        emit WithdrawSuccessful(_custodian, _amount);
    }

    function getWorkerParamsIndex(EnigmaState.State storage state, uint _blockNumber)
    internal
    view
    returns (uint)
    {
        // The workers parameters for a given block number
        int8 index = - 1;
        for (uint i = 0; i < state.workersParams.length; i++) {
            if (state.workersParams[i].firstBlockNumber <= _blockNumber && (index == - 1 || state.workersParams[i].firstBlockNumber > state.workersParams[uint(index)].firstBlockNumber)) {
                index = int8(i);
            }
        }
        require(index != - 1, "No workers parameters entry for specified block number");
        return uint(index);
    }

    function getParams(EnigmaState.State storage state, uint _blockNumber) internal view returns (EnigmaCommon.WorkersParams memory) {
        uint index = getWorkerParamsIndex(state, _blockNumber);
        return state.workersParams[index];
    }

    function getFirstBlockNumberImpl(EnigmaState.State storage state, uint _blockNumber)
    public
    view
    returns (uint) {
        EnigmaCommon.WorkersParams memory params = getParams(state, _blockNumber);
        return params.firstBlockNumber;
    }

    function getWorkerParamsImpl(EnigmaState.State storage state, uint _blockNumber)
    public
    view
    returns (uint, uint, address[] memory, uint[] memory) {
        EnigmaCommon.WorkersParams memory params = getParams(state, _blockNumber);
        return (params.firstBlockNumber, params.seed, params.workers, params.balances);
    }

    /**
    * Select a worker for the computation task pseudorandomly based on the epoch, secret contract address, and nonce
    *
    * @param _paramIndex Param index
    * @param _scAddr Secret contract address
    * @param _nonce Counter
    * @return Selected worker's address
    */
    function selectWeightedRandomWorker(EnigmaState.State storage state, uint _paramIndex, bytes32 _scAddr, uint _nonce)
    internal
    view
    returns (address)
    {
        EnigmaCommon.WorkersParams memory params = state.workersParams[_paramIndex];
        uint tokenCpt = 0;
        for (uint i = 0; i < params.workers.length; i++) {
            if (params.workers[i] != address(0)) {
                tokenCpt = tokenCpt.add(params.balances[i]);
            }
        }
        bytes32 randHash = keccak256(abi.encodePacked(params.seed, _scAddr, _nonce));
        int randVal = int256(uint256(randHash) % tokenCpt);
        for (uint k = 0; k < params.workers.length; k++) {
            if (params.workers[k] != address(0)) {
                randVal -= int256(params.balances[k]);
                if (randVal <= 0) {
                    return params.workers[k];
                }
            }
        }
        return params.workers[params.workers.length - 1];
    }

    /**
    * Select a group of workers for the computation task given the block number of the task record (implies the epoch)
    * and the secret contract address.
    *
    * @param _blockNumber Block number the task record was mined
    * @param _scAddr Secret contract address
    * @return Selected workers' addresses
    */
    function getWorkerGroupImpl(EnigmaState.State storage state, uint _blockNumber, bytes32 _scAddr)
    public
    view
    returns (address[] memory)
    {
        // Compile a list of selected workers for the block number and
        // secret contract.
        uint paramIndex = getWorkerParamsIndex(state, _blockNumber);

        address[] memory selectedWorkers = new address[](state.workerGroupSize);
        uint nonce = 0;
        for (uint it = 0; it < state.workerGroupSize; it++) {
            do {
                address worker = selectWeightedRandomWorker(state, paramIndex, _scAddr, nonce);
                bool dup = false;
                for (uint id = 0; id < selectedWorkers.length; id++) {
                    if (worker == selectedWorkers[id]) {
                        dup = true;
                        break;
                    }
                }
                if (dup == false) {
                    selectedWorkers[it] = worker;
                }
                nonce++;
            }
            while (selectedWorkers[it] == address(0));
        }
        return selectedWorkers;
    }

}
