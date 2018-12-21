pragma solidity ^0.5.0;

import "./Enigma.sol";

contract CoinMixer {

    Enigma public enigma;

    struct Deal {
        address organizer;
        uint48 startTime;
        uint8 status; // 0: active; 1: funded; 2: executed; 3: cancelled
        uint depositSum;
        uint numDeposits;
        uint depositInWei;
        uint numParticipants;
        bytes32 title;
        bytes[] encryptedDestAddresses;
        address[] destAddresses;
        mapping(address => uint) deposit;
    }

    Deal[] public deals;

    event NewDeal(
        address indexed user,
        uint32 indexed _dealId,
        uint48 _startTime,
        bytes32 _title,
        uint _depositInWei,
        uint _numParticipants,
        bool _success,
        string _err
    );
    event Deposit(
        address indexed _depositor,
        uint32 indexed _dealId,
        bytes _encryptedDestAddress,
        uint _value,
        bool _success,
        string _err
    );
    event Distribute(
        uint32 indexed _dealId,
        uint individualAmountInWei,
        address[] destAddresses,
        uint32 nbTransfers,
        bool _success,
        string _err
    );

    event TransferredToken(address indexed to, uint256 value);
    event FailedTransfer(address indexed to, uint256 value);

    event DealFullyFunded(uint32 indexed _dealId);
    event DealExecuted(uint32 indexed _dealId, bool _success);

    // TODO: switch to require() once it accepts a message parameter
    enum ReturnValue {Ok, Error}

    constructor(address _enigmaAddress) public {
        enigma = Enigma(_enigmaAddress);
    }

    function newDeal(bytes32 _title, uint _depositInWei, uint _numParticipants)
    public
    returns (ReturnValue)
    {
        uint32 dealId = uint32(deals.length);

        deals.length++;
        deals[dealId].organizer = msg.sender;
        deals[dealId].title = _title;
        deals[dealId].depositSum = 0;
        deals[dealId].numDeposits = 0;
        deals[dealId].startTime = uint48(now);
        deals[dealId].depositInWei = _depositInWei;
        deals[dealId].numParticipants = _numParticipants;
        deals[dealId].encryptedDestAddresses = new bytes[](_numParticipants);
        deals[dealId].destAddresses = new address[](_numParticipants);
        deals[dealId].status = 0;
        emit NewDeal(
            msg.sender,
            dealId,
            uint48(now),
            _title,
            _depositInWei,
            _numParticipants,
            true,
            "all good"
        );

        return ReturnValue.Ok;
    }

    function makeDeposit(uint32 dealId, bytes encryptedDestAddress)
    public
    payable
    returns (ReturnValue)
    {
        require(msg.value > 0, "Deposit value must be positive.");
        require(deals[dealId].status == 0, "Illegal state for deposits.");

        Deal storage deal = deals[dealId];
        require((msg.value % deal.depositInWei) == 0, "Deposit value must be a multiple of claim value.");
        require(deal.deposit[msg.sender] == 0, "Cannot deposit twice with the same address.");

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

    function mixAddresses(uint32 dealId, address[] destAddresses, uint256 rand)
    public
    pure
    returns (uint32, address[])
    {
        // Shuffling the specified address using a random seed.
        // Doing a Fisher-Yates Shuffle with a single integer
        // between 0 and 127. To get more numbers in the loop,
        // we'll add 1 to our seed and hash it.
        uint i = destAddresses.length;
        while (i > 0) {
            uint j = uint(keccak256(abi.encodePacked(rand + 1))) % i;

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
        require(msg.sender == address(enigma), "Sender is not the Enigma contract.");
        _;
    }

    function distribute(uint32 dealId, address[] destAddresses)
    public
    onlyEnigma()
    returns (ReturnValue)
    {
        // Distribute the deposits to destination addresses
        require(deals[dealId].status == 1, "Deal is not executed.");
        deals[dealId].destAddresses = destAddresses;

        for (uint i = 0; i < deals[dealId].destAddresses.length; i++) {
            deals[dealId].destAddresses[i].transfer(deals[dealId].depositInWei);
        }

        emit Distribute(
            dealId,
            deals[dealId].depositInWei,
            deals[dealId].destAddresses,
            uint32(deals[dealId].destAddresses.length),
            true,
            "all good"
        );
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
    returns (bytes32, uint, uint, uint, uint, uint)
    {
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
    public
    view
    returns (uint)
    {
        // Count the addresses
        return deals[_dealId].encryptedDestAddresses.length;
    }

    function getEncryptedAddress(uint32 _dealId, uint index)
    public
    view
    returns (bytes)
    {
        // Returns an array of encrypted addresses
        return deals[_dealId].encryptedDestAddresses[index];
    }
}

