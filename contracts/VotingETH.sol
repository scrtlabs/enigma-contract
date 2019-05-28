pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

contract VotingETH {
    struct Poll {
        address creator;
        uint256 quorumPercentage;
        uint256 expirationTime;
        PollStatus status;
        string description;
    }

    enum PollStatus { UNDEFINED, IN_PROGRESS, PASSED, REJECTED }

    Poll[] public polls;

    constructor() public {

    }

    modifier validPoll(uint256 _pollId) {
        require(_pollId < polls.length, "Not a valid poll ID");
        _;
    }

    function createPoll(uint256 _quorumPercentage, string memory _description, uint256 _pollLength) public {
        require(_quorumPercentage <= 100, "Quorum percentage must be less than 100");
        require(_pollLength > 0, "Poll length must be greater than 0");
        polls.push(Poll({
            creator: msg.sender,
            quorumPercentage: _quorumPercentage,
            expirationTime: now + _pollLength * 1 seconds,
            status: PollStatus.IN_PROGRESS,
            description: _description
            }));
    }

    function validateCastVote(uint256 _pollId) public validPoll(_pollId) {
        Poll memory poll = polls[_pollId];
        require((poll.status == PollStatus.IN_PROGRESS) && (now < poll.expirationTime), "Invalid poll vote being cast to");
    }

    function validateTallyPoll(uint256 _pollId, uint256 _talliedQuorum) public validPoll(_pollId) {
        Poll storage poll = polls[_pollId];
        require((poll.status == PollStatus.IN_PROGRESS) && (now >= poll.expirationTime), "Invalid poll results being tallied");
        poll.status = _talliedQuorum >= poll.quorumPercentage ? PollStatus.PASSED : PollStatus.REJECTED;
    }

    function getPolls() public returns (Poll[] memory) {
        return polls;
    }
}
