rm -rf build
darq-truffle compile
darq-truffle migrate --reset --network ganache
darq-truffle test --network ganache
#node ./integration/coin-mixer.js