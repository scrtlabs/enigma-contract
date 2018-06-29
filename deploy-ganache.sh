rm -rf build
darq-truffle compile
darq-truffle migrate --reset --network ganache_remote
darq-truffle test --network ganache_remote
