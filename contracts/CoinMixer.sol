pragma solidity ^0.4.22;

import "./Enigma.sol";
import "./EnigmaP.sol";
import "./utils/RLPEncode.sol";

contract CoinMixer is EnigmaP {
    using RLPEncode for bytes[];

    Enigma public enigma;

    struct Deal {
        address organizer;
        bytes32 title;
        mapping(address => uint) deposit;
        uint depositSum;
        uint numDeposits;

        uint startTime;
        uint depositInWei;
        uint numParticipants;

        bytes[] encryptedDestAddresses;
        address[] destAddresses;

        uint status; // 0: active; 1: funded; 2: executed; 3: cancelled
    }

    Deal[] public deals;

    event NewDeal(address indexed user, uint32 indexed _dealId, uint _startTime, bytes32 _title, uint _depositInWei, uint _numParticipants, bool _success, string _err);
    event Deposit(address indexed _depositor, uint32 indexed _dealId, bytes _encryptedDestAddress, uint _value, bool _success, string _err);
    event Distribute(uint32 indexed _dealId, bool _success, string _err);

    event TransferredToken(address indexed to, uint256 value);
    event FailedTransfer(address indexed to, uint256 value);

    event DealFullyFunded(uint32 indexed _dealId);
    event DealExecuted(uint32 indexed _dealId, bool _success);

    // TODO: switch to require() once it accepts a message parameter
    enum ReturnValue {Ok, Error}

    function CoinMixer(address _enigmaAddress) public {
        enigma = Enigma(_enigmaAddress);
    }

    function newDeal(bytes32 _title, uint _depositInWei, uint _numParticipants)
    public
    returns (ReturnValue) {
        uint32 dealId = uint32(deals.length);

        deals.length++;
        deals[dealId].organizer = msg.sender;
        deals[dealId].title = _title;
        deals[dealId].depositSum = 0;
        deals[dealId].numDeposits = 0;
        deals[dealId].startTime = now;
        deals[dealId].depositInWei = _depositInWei;
        deals[dealId].numParticipants = _numParticipants;
        deals[dealId].encryptedDestAddresses = new bytes[](_numParticipants);
        deals[dealId].destAddresses = new address[](_numParticipants);
        deals[dealId].status = 0;
        emit NewDeal(msg.sender, dealId, now, _title, _depositInWei, _numParticipants, true, "all good");

        return ReturnValue.Ok;
    }

    function makeDeposit(uint32 dealId, bytes encryptedDestAddress)
    public
    payable
    returns (ReturnValue){
        require(msg.value > 0, "Deposit value must be positive.");
        require(deals[dealId].status == 0, "Illegal state for deposits.");

        Deal storage deal = deals[dealId];
        require((msg.value % deal.depositInWei) == 0, "Deposit value must be a multiple of claim value");
        require(deal.deposit[msg.sender] == 0, "Cannot deposit twice with the same address");

        // actual deposit
        deal.depositSum += msg.value;
        deal.deposit[msg.sender] = msg.value;
        deal.encryptedDestAddresses[deal.numDeposits] = encryptedDestAddress;
        deal.numDeposits += 1;

        emit Deposit(msg.sender, dealId, encryptedDestAddress, msg.value, true, "all good");

        if (deal.numDeposits >= deal.numParticipants) {
            deal.status = 1;
            emit DealFullyFunded(dealId);
        }
        return ReturnValue.Ok;
    }

    function executeDeal(uint32 dealId)
    public
    payable
    {
        // Execute the deal and pay for computation
        // TODO: refactor for RLP
        Deal storage deal = deals[dealId];

        // After giving this some thought, this is what I came up with to serialize arguments
        // To avoid unecessary complexity, arguments will be provided as a bytes32 array
        // Each argument will start by it's declaration like in the target function
        //    name type (e.g. uint dealId)
        // Followed by bytes32 encoded values.
        // If the value is an array, just add each value sequentially.
        // The EnigmaP contract has helper function to populate the arguments.
        //        bytes32[] memory args = new bytes32[](deal.numDeposits + 3);
        //        uint offset = 0;
        //        offset = addArg(args, "uint dealId", offset, dealId);
        //        offset = addEncryptedArg(args, "address[] destAddresses", offset, deal.encryptedDestAddresses);
        bytes memory args = new bytes(64);

        // This is the most generic way I came up with for the preprocessors.
        // We can accept an unlimited number of preprocessors, each of which
        // might have arbitrary attributes.
        // The enclave will know who to apply each preprocessor by convention.
        bytes32[] memory preprocessors = new bytes32[](1);
        preprocessors[0] = "rand()";

        // enigma.compute.value(msg.value)(this, "mixAddresses", args, "distribute", preprocessors);
        emit DealExecuted(dealId, true);
    }

    function mixAddresses(uint32 dealId, address[] destAddresses, uint rand)
    public
    pure
    returns (uint, address[]) {
        // Shuffling the specified address using a random seed.
        // Doing a Fisher-Yates Shuffle with a single integer
        // between 0 and 127. To get more numbers in the loop,
        // we'll add 1 to our seed and hash it.
        uint i = destAddresses.length;
        while (i > 0) {
            uint j = uint(sha256(rand + 1)) % i;

            // Array swap
            if (destAddresses[j] != destAddresses[i - 1]) {
                address destAddress = destAddresses[i - 1];
                destAddresses[i - 1] = destAddresses[j];
                destAddresses[j] = destAddress;
            }
            i--;
        }
        return (dealId, destAddresses);
    }

    modifier onlyEnigma() {
        require(msg.sender == address(enigma));
        _;
    }

    function distribute(uint32 dealId, address[] destAddresses)
    public
    onlyEnigma()
    returns (ReturnValue){
        //        Deal storage deal = deals[dealId];
        //        require(deal.status == 2, "Deal is not executed.");
        //
        //        deal.destAddresses = destAddresses;
        //
        //        bool enoughAddresses = deal.destAddresses.length == deal.numParticipants;
        //        require(enoughAddresses, "missing some destination addresses");
        //
        //        for (uint i = 0; i < deal.destAddresses.length; i++) {
        //            deal.destAddresses[i].transfer(deal.depositSum);
        //        }
        //
        emit Distribute(dealId, true, "all good");
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

    function dealStatus(uint32 _dealId)
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

    function countEncryptedAddresses(uint32 _dealId)
    public view
    returns (uint) {
        // Count the addresses
        return deals[_dealId].encryptedDestAddresses.length;
    }

    function getEncryptedAddress(uint32 _dealId, uint index)
    public
    view
    returns (bytes) {
        // Returns an array of encrypted addresses
        return deals[_dealId].encryptedDestAddresses[index];
    }
}

