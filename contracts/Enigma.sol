pragma solidity ^0.4.19;

contract SafeMath {
    function safeMul(uint a, uint b) internal returns (uint) {
        uint c = a * b;
        assert(a == 0 || c / a == b);
        return c;
    }

    function safeSub(uint a, uint b) internal returns (uint) {
        assert(b <= a);
        return a - b;
    }

    function safeAdd(uint a, uint b) internal returns (uint) {
        uint c = a + b;
        assert(c >= a && c >= b);
        return c;
    }

    function assert(bool assertion) internal {
        if (!assertion) throw;
    }
}

contract Enigma is SafeMath {
    struct SecretContract {
        bytes32 name;
        mapping(address => uint) balance;
        mapping(bytes32 => mapping(address => uint)) computations; // Computation hash mapped to fees
    }

    mapping(address => SecretContract) _secretContracts;
    mapping(address => uint) _bank;
    mapping(address => uint) public _validators; // funds assigned to validators

    event Register(address secretContract, bytes32 name, bool _success);
    event Deposit(address secretContract, address user, address token, uint amount, uint balance, bool _success);
    event Withdraw(address secretContract, address user, address token, uint amount, uint balance, bool _success);
    event ApplyComputations(address secretContract, bytes32 hashes, bool _success);

    enum ReturnValue {Ok, Error}

    function Enigma() public {

    }

    function register(address secretContract, bytes32 name) {
        if (_secretContracts[secretContract].name != "") revert();

        _secretContracts[secretContract].name = name;
        _secretContracts[secretContract].balance[0x0000000000000000000000000000000000000000] = 0;
        _secretContracts[secretContract].balance[0xf0ee6b27b759c9893ce4f094b49ad28fd15a23e4] = 0;

        Register(secretContract, name, true);
    }

    function applyComputations(address secretContract, bytes32[] hashes, mapping(address => uint)[] fees, address[][] validators) {
        SecretContract sc = _secretContracts[secretContract];
        if (sc.name == "") revert();

        for (uint i = 0; i < hashes.length; i++) {
            sc.computations[hashes[i]] = fees[i];

            // Divide the ENG computation fees between validators
            // TODO: reward the worker
            uint reward = fees[i][0xf0ee6b27b759c9893ce4f094b49ad28fd15a23e4] / validators[i].length;
            for (uint iv = 0; iv < validators[i].length; iv++) {
                if (_validators[validators[i][iv]] > 0) {
                    _validators[validators[i][iv]] = safeAdd(_validators[validators[i][iv]], reward);
                } else {
                    _validators[validators[i][iv]] = reward;
                }
            }
        }
        ApplyComputations(secretContract, hashes, true);
    }

    function depositToken(address secretContract, address token, uint amount) {
        if (token == 0) revert();

        SecretContract sc = _secretContracts[secretContract];
        if (sc.name == "") revert();

        sc.balance[token] = safeAdd(sc.balance[token], amount);
        Deposit(secretContract, msg.sender, token, amount, sc.balance[token], true);
    }

    function withdrawToken(address secretContract, address token, uint amount) {
        // TODO: implement support for the ENG token
        if (secretContract != 0x0000000000000000000000000000000000000000) revert();
        if (amount == 0) revert();

        SecretContract sc = _secretContracts[secretContract];
        if (sc.name == "") revert();
        if (sc.balance[token] < amount) revert();

        sc.balance[token] = safeSub(sc.balance[token], amount);
        msg.sender.transfer(amount);
        Withdraw(secretContract, msg.sender, token, amount, sc.balance[token], true);
    }
}
