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

    //    struct RunnerArgs {
    //        uint dealId;
    //        string[] encryptedDestAddresses;
    //    }
    //
    //    event EngimaRun(string _runner, string _args, string _setter);

    enum ReturnValue {Ok, Error}

    function CoinMixer(){
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
        Deal deal = _deals[dealId];
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
            if (!msg.sender.send(msg.value)) throw;
            // send money back
            return ReturnValue.Error;
        }

        // actual deposit
        deal.depositSum += msg.value;
        deal.deposit[msg.sender] = msg.value;
        deal.numDeposits += 1;
        deal.encryptedDestAddresses.push(encryptedDestAddress);

        if (deal.numDeposits >= deal.numParticipants) {
            deal.fullyFunded = true;
            DealFullyFunded(dealId);

            //            RunnerArgs memory args = RunnerArgs(dealId, deal.encryptedDestAddresses);
            //            string args = '{"dealId":"", }';
            //            EngimaRun("mixAddresses", args, "setDestAddresses");
        }

        Deposit(msg.sender, dealId, encryptedDestAddress, msg.value, true, "all good");
        return ReturnValue.Ok;
    }

    function mixAddresses(uint dealId, address[] destAddresses) public returns (uint, address[]) {
        // TODO: put mixing logic here
        return (dealId, destAddresses);
    }

    function setDestAddresses(uint dealId, address[] destAddresses) public returns (ReturnValue){
        bool errorDetected = false;
        string memory error;

        Deal deal = _deals[dealId];
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
        return ReturnValue.Ok;
    }


    function distribute(uint dealId) private returns (ReturnValue){
        // validation
        bool errorDetected = false;
        string memory error;
        Deal deal = _deals[dealId];
        bool enoughAddresses = deal.destAddresses.length >= deal.numParticipants;
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

    function listDealTitles() public view returns (bytes32[]) {
        bytes32[] titles;
        uint dealId = 0;
        while (dealId < _deals.length) {
            titles[dealId] = _deals[dealId].title;
            dealId++;
        }
        return titles;
    }

    ////////////////////////////////////////////////////////////////////////////////////////

    function dealStatus(uint _dealId) public view returns (uint[6]){
        uint active = _deals[_dealId].active ? 1 : 0;
        uint numParticipants = _deals[_dealId].numParticipants;
        uint deposit = _deals[_dealId].depositInWei;
        uint numDeposits = _deals[_dealId].numDeposits;
        uint depositSum = _deals[_dealId].depositSum;
        uint numDestAddresses = _deals[_dealId].destAddresses.length;


        return [active, numParticipants, deposit, numDeposits, depositSum, numDestAddresses];
    }

}

