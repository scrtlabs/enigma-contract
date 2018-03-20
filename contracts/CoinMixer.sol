pragma solidity ^0.4.19;


contract CoinMixer {
    struct Deal {
        bytes32 title;
        mapping(address => uint) deposit;
        uint depositSum;
        uint numDeposits;

        uint startTime;
        uint depositInWei;
        uint numParticipants;

        bytes32[] encryptedDestAddresses;
        address[] destAddresses;

        bool active;
        bool fullyFunded;
    }

    struct DealSummary {
        bytes32 title;
    }

    Deal[]  _deals;

    event NewDeal(address indexed user, uint indexed _dealId, uint _startTime, bytes32 _title, uint _depositInWei, uint _numParticipants, bool _success, string _err);
    event Deposit(address indexed _depositor, uint indexed _dealId, bytes32 _encryptedDestAddress, uint _value, bool _success, string _err);
    event Distribute(address[] indexed _destAddresses, uint indexed _dealId, bool _success, string _err);

    event TransferredToken(address indexed to, uint256 value);
    event FailedTransfer(address indexed to, uint256 value);

    event DealFullyFunded(uint indexed _dealId);

    // The generic Enigma computation event
    event SecretCall(bytes32 callable, bytes32[] callableArgs, bytes32 callback, uint max_cost);

    // TODO: switch to require() once it accepts a message parameter
    enum ReturnValue {Ok, Error}

    function CoinMixer() public {
    }

    function newDeal(bytes32 _title, uint _depositInWei, uint _numParticipants) public returns (ReturnValue) {
        uint dealId = _deals.length;

        _deals.length++;
        _deals[dealId].title = _title;
        _deals[dealId].depositSum = 0;
        _deals[dealId].numDeposits = 0;
        _deals[dealId].startTime = now;
        _deals[dealId].depositInWei = _depositInWei;
        _deals[dealId].numParticipants = _numParticipants;
        _deals[dealId].encryptedDestAddresses = new bytes32[](_numParticipants);
        _deals[dealId].destAddresses = new address[](_numParticipants);
        _deals[dealId].fullyFunded = false;
        _deals[dealId].active = true;
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

    function makeDeposit(uint dealId, bytes32 encryptedDestAddress) public payable returns (ReturnValue){
        bool errorDetected = false;
        string memory error;
        // validations
        if (msg.value == 0) {
            error = "deposit value must be positive";
            errorDetected = true;
        }
        if (!_deals[dealId].active) {
            error = "deal is not active";
            errorDetected = true;
        }

        Deal storage deal = _deals[dealId];
        if ((msg.value % deal.depositInWei) > 0) {
            error = "deposit value must be a multiple of claim value";
            errorDetected = true;
        }
        if (deal.deposit[msg.sender] > 0) {
            error = "cannot deposit twice with the same address";
            errorDetected = true;
        }
        if (deal.fullyFunded) {
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
        deal.numDeposits += 1;
        deal.encryptedDestAddresses.push(encryptedDestAddress);

        Deposit(msg.sender, dealId, encryptedDestAddress, msg.value, true, "all good");

        if (deal.numDeposits >= deal.numParticipants) {
            deal.fullyFunded = true;
            DealFullyFunded(dealId);

            // For now, I'm adding adding the dealId as the first argument.
            // The logic looks like this: f(bytes32 dealId, bytes32 encryptedDestAddresses1, bytes32 encryptedDestAddresses1, ...)
            // This works fine until we have to support more than one dynamic array.
            bytes32[] memory args = new bytes32[](deal.encryptedDestAddresses.length + 1);
            args[0] = bytes32(dealId);
            for (uint i = 0; i < deal.encryptedDestAddresses.length; i++) {
                args[i + 1] = deal.encryptedDestAddresses[i];
            }
            // Calls the Enigma computation
            SecretCall("mixAddresses", args, "distribute", 0);
        }
        return ReturnValue.Ok;
    }

    function mixAddresses(uint dealId, address[] destAddresses) public pure returns (uint, address[]) {
        // TODO: put mixing logic here
        return (dealId, destAddresses);
    }

    function distribute(uint dealId, address[] destAddresses) private returns (ReturnValue){
        bool errorDetected = false;
        string memory error;

        Deal storage deal = _deals[dealId];
        if (!deal.active) {
            error = "deal is not active";
            errorDetected = true;
        }
        if (!deal.fullyFunded) {
            error = "deal is not fulling funded";
            errorDetected = true;
        }
        if (errorDetected) {
            return ReturnValue.Error;
        }
        deal.destAddresses = destAddresses;

        bool enoughAddresses = deal.destAddresses.length == deal.numParticipants;
        if (!enoughAddresses) {
            error = "missing some destination addresses";
            errorDetected = true;
        }
        if (errorDetected) {
            Distribute(deal.destAddresses, dealId, false, error);
            return ReturnValue.Error;
        }

        uint256 i = 0;
        while (i < deal.destAddresses.length) {
            deal.destAddresses[i].transfer(deal.depositSum);
            i++;
        }

        Distribute(deal.destAddresses, dealId, true, "all good");
        return ReturnValue.Ok;
    }

    ////////////////////////////////////////////////////////////////////////////////////////
    //VIEWS/////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////

    function listDealTitles() public view returns (bytes32[]) {
        bytes32[] memory titles = new bytes32[](_deals.length);
        uint dealId = 0;
        while (dealId < _deals.length) {
            titles[dealId] = _deals[dealId].title;
            dealId++;
        }
        return titles;
    }

    function dealStatus(uint _dealId) public view returns (uint[6]){
        uint active = _deals[_dealId].active ? 1 : 0;
        uint numParticipants = _deals[_dealId].numParticipants;
        uint deposit = _deals[_dealId].depositInWei;
        uint numDeposits = _deals[_dealId].numDeposits;
        uint depositSum = _deals[_dealId].depositSum;
        uint numDestAddresses = _deals[_dealId].destAddresses.length;


        return [active, numParticipants, deposit, numDeposits, depositSum, numDestAddresses];
    }

    function isParticipating(uint _dealId) public view returns (bool) {
        bool participating = false;
        if (_deals[_dealId].deposit[msg.sender] > 0) {
            participating = true;
        }
        return participating;
    }
}

