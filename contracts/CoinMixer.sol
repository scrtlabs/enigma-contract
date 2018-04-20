pragma solidity ^0.4.22;

import "./Enigma.sol";
import "./EnigmaP.sol";

contract CoinMixer is EnigmaP {
    Enigma enigma;

    struct Deal {
        address organizer;
        bytes32 title;
        mapping(address => uint) deposit;
        uint depositSum;
        uint numDeposits;

        uint startTime;
        uint depositInWei;
        uint numParticipants;

        bytes32[] encryptedDestAddresses;
        address[] destAddresses;

        uint status; // 0: active; 1: funded; 2: executed; 3: cancelled
    }

    Deal[] deals;

    event NewDeal(address indexed user, uint indexed _dealId, uint _startTime, bytes32 _title, uint _depositInWei, uint _numParticipants, bool _success, string _err);
    event Deposit(address indexed _depositor, uint indexed _dealId, bytes32 _encryptedDestAddress, uint _value, bool _success, string _err);
    event Distribute(uint indexed _dealId, bool _success, string _err);

    event TransferredToken(address indexed to, uint256 value);
    event FailedTransfer(address indexed to, uint256 value);

    event DealFullyFunded(uint indexed _dealId);
    event DealExecuted(uint indexed _dealId, int8 n1, int24 n2, bool _success);


    // TODO: switch to require() once it accepts a message parameter
    enum ReturnValue {Ok, Error}

    function CoinMixer() public {
        // TODO: consider externalizing in library
        enigma = Enigma(0x74e3fc764c2474f25369b9d021b7f92e8441a2dc);
    }

    function newDeal(bytes32 _title, uint _depositInWei, uint _numParticipants)
    public
    returns (ReturnValue) {
        uint dealId = deals.length;

        deals.length++;
        deals[dealId].organizer = msg.sender;
        deals[dealId].title = _title;
        deals[dealId].depositSum = 0;
        deals[dealId].numDeposits = 0;
        deals[dealId].startTime = now;
        deals[dealId].depositInWei = _depositInWei;
        deals[dealId].numParticipants = _numParticipants;
        deals[dealId].encryptedDestAddresses = new bytes32[](_numParticipants);
        deals[dealId].destAddresses = new address[](_numParticipants);
        deals[dealId].status = 0;
        NewDeal(msg.sender,
            dealId,
            now,
            _title,
            _depositInWei,
            _numParticipants,
            true,
            "all good");
        return ReturnValue.Ok;
    }

    function makeDeposit(uint dealId, bytes32 encryptedDestAddress)
    public
    payable
    returns (ReturnValue){
        bool errorDetected = false;
        string memory error;
        // validations
        if (msg.value == 0) {
            error = "deposit value must be positive";
            errorDetected = true;
        }
        if (deals[dealId].status != 0) {
            error = "deal is not active";
            errorDetected = true;
        }

        Deal storage deal = deals[dealId];
        if ((msg.value % deal.depositInWei) > 0) {
            error = "deposit value must be a multiple of claim value";
            errorDetected = true;
        }
        if (deal.deposit[msg.sender] > 0) {
            error = "cannot deposit twice with the same address";
            errorDetected = true;
        }
        if (deal.status == 1) {
            error = "deal is already fulling funded";
            errorDetected = true;
        }
        if (errorDetected) {
            Deposit(msg.sender, dealId, encryptedDestAddress, msg.value, false, error);
            // send money back
            return ReturnValue.Error;
        }

        // actual deposit
        deal.depositSum += msg.value;
        deal.deposit[msg.sender] = msg.value;
        deal.encryptedDestAddresses[deal.numDeposits] = encryptedDestAddress;
        deal.numDeposits += 1;

        Deposit(msg.sender, dealId, encryptedDestAddress, msg.value, true, "all good");

        if (deal.numDeposits >= deal.numParticipants) {
            deal.status = 1;
            DealFullyFunded(dealId);
        }
        return ReturnValue.Ok;
    }

    function executeDeal(uint dealId)
    public
    payable
    {
        // Execute the deal and pay for computation
        Deal storage deal = deals[dealId];

        bytes memory buffer = new bytes(64);
        bytes32[] out7 = new bytes32[](2);
        out7[0] = 'dsdsfsdfs';
        out8[0] = 'dfsdfssdfsdfsf';

        // Serializing
        uint offset = 64;

        addressToBytes(offset, out7[0], buffer);
        addressToBytes(offset, out7[1], buffer);

        // Deserializing
        offset = 64;

        address a1 = bytesToAddress(offset, buffer);
        offset -= sizeOfAddress();
        address a2 = bytesToInt8(offset, buffer);
        offset -= sizeOfAddress();

        int24 n2 = bytesToInt24(offset, buffer);
        offset -= sizeOfUint(24);
        //
        //        int32 n3 = bytesToUint8(offset, buffer);
        //        offset -= sizeOfInt(32);

        DealExecuted(dealId, n1, n2, true);
        // TODO: consider encapsulating param encoding in library
        // For now, I'm adding adding the dealId as the first argument.
        // The logic looks like this: f(bytes32 dealId, bytes32 encryptedDestAddresses1, bytes32 encryptedDestAddresses1, ...)
        // This works fine until we have to support more than one dynamic array.
        //        bytes32[] memory args = new bytes32[](deal.numDeposits + 1);
        //        args[0] = uintToBytes(dealId);
        //        for (uint i = 0; i < deal.encryptedDestAddresses.length; i++) {
        //            args[i + 1] = deal.encryptedDestAddresses[i];
        //        }
        // Pre-processing
        // 1. Decrypt arguments
        // 2. Apply service parameters
        // TODO: pass randomization parameters
        //            enigma.compute.value(msg.value)(msg.sender, this, "mixAddresses", args, "distribute");
    }

    function mixAddresses(uint dealId, address[] destAddresses, address[] second)
    public
    pure
    returns (uint, address[]) {
        // TODO: put mixing logic here
        //        random()
        return (dealId, destAddresses);
    }

    function distribute(uint dealId, address[] destAddresses)
    public
    returns (ReturnValue){
        bool errorDetected = false;
        string memory error;

        Deal storage deal = deals[dealId];
        if (deal.status != 0) {
            error = "deal is not active";
            errorDetected = true;
        }
        if (deal.status != 1) {
            error = "deal is not fulling funded";
            errorDetected = true;
        }
        if (errorDetected) {
            Distribute(dealId, false, error);
            return ReturnValue.Error;
        }
        deal.destAddresses = destAddresses;

        bool enoughAddresses = deal.destAddresses.length == deal.numParticipants;
        if (!enoughAddresses) {
            error = "missing some destination addresses";
            errorDetected = true;
        }
        if (errorDetected) {
            Distribute(dealId, false, error);
            return ReturnValue.Error;
        }

        for (uint i = 0; i < deal.destAddresses.length; i++) {
            deal.destAddresses[i].transfer(deal.depositSum);
        }

        Distribute(dealId, true, "all good");
        return ReturnValue.Ok;
    }

    function listDeals() public view returns (uint[], uint[], uint[]) {
        // A list of deals with their key properties
        uint[] memory status = new uint[](deals.length);
        uint[] memory participates = new uint[](deals.length);
        uint[] memory organizes = new uint[](deals.length);

        for (uint i = 0; i < deals.length; i++) {
            status[i] = deals[i].status;

            if (deals[i].deposit[msg.sender] > 0) {
                participates[i] = 1;
            }

            if (deals[i].organizer == msg.sender) {
                organizes[i] = 1;
            }
        }
        return (status, participates, organizes);
    }

    function dealStatus(uint _dealId)
    public
    view
    returns (bytes32, uint, uint, uint, uint, uint){
        // Key attributes of a deal
        bytes32 title = deals[_dealId].title;
        uint numParticipants = deals[_dealId].numParticipants;
        uint deposit = deals[_dealId].depositInWei;
        uint numDeposits = deals[_dealId].numDeposits;
        uint depositSum = deals[_dealId].depositSum;
        uint numDestAddresses = deals[_dealId].destAddresses.length;

        return (title, numParticipants, deposit, numDeposits, depositSum, numDestAddresses);
    }

    function getEncryptedAddresses(uint _dealId) public view returns (bytes32[]) {
        // Returns an array of encrypted addresses
        return deals[_dealId].encryptedDestAddresses;
    }

    function uintToBytes(uint v) private pure returns (bytes32 ret) {
        // Serialize bytes to int
        // TODO: cleanup and externalize
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

