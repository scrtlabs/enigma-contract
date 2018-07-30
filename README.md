# enigma-contract

[![Build Status](https://travis-ci.com/enigmampc/enigma-contract.svg?token=cNBBjbVVEGszuAJUokFT&branch=master)](https://travis-ci.com/enigmampc/enigma-contract)

The Solidity contracts of the Enigma Protocol with a Truffle test bed. Refer to the [Protocol documentation](https://enigma.co/protocol) for more information.

## Test

1. Install package dependencies
``` 
cd enigma-contract 
npm install
```
2. Install Nightly Truffle 
```
npm install -g darq-truffle@next
```
3. Run the Unit Tests
```
darq-truffle test --network development
```
