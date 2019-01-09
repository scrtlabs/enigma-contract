# Integration Tests

All tests in this folder are excluded by default in the standard test suite when you run `yarn test`. 
To run the tests in this folder, you have to run:
```
yarn test:integration
```
which will only run the tests in this folder, but will not run all the rest of tests.

## Requirements

For these tests to pass, it is required to have two instances of `enigma-p2p`:
* Proxy Node: `node cli_app.js -i B1 -b B1 -p B1 --proxy 3346`
* Worker Node: `node cli_app.js -b B1 -n peer1 --core 5556`

And an instance of core running `test_real_listener` (comment out the `#[ignore]` line right before the actual test)
