# Integration Tests

All tests in this folder are excluded by default in the standard test suite when you run `yarn test`, and are used instead in the [Discovery Integration Tests](https://github.com/enigmampc/discovery-integration-tests).

## Template files for tests

This repository provides template files for integrationTests, which are then parsed by a [launch script](https://github.com/enigmampc/discovery-integration-tests/blob/master/enigma-contract/start_test.bash) in the Discovery Integration Tests repo that configures IP and contract addresses for each network configuration where these tests are run. The test files are renamed at the time of parsing like so: ` template.01_init.js` becomes `01_init.spec.js`. This repository is configured to ignore the resulting test files, and only tracks the templates. 

## Order in which tests are run

`testList.template.txt` provides a template for which tests are run, and it is used by the Continuous Integration (CI) services in the Discovery Integration Tests repository. You can override it with:
```
$ cp testList.template.txt testList.txt
```
and editing `testList.txt` to match your needs. It is a simple text file, with one test filename per line, as documented below. Keep in mind that the list is of the actual test files, not the templates.
```
01_init.spec.js
02_deploy_addition.spec.js
03_deploy_fail.spec.js
```

## Manually running the tests

To run these tests, execute:
```
$ ./runTests.bash 
```
which will only run the tests in this folder, and will not run all the other unit tests. This command relies on `yarn test:integration` and controls the order in which the various tests are run. If you were to run `yarn test:integration` directly, the files would be run at random.

It will first check if `testList.txt` exists and run the tests listed therein. If this file does not exist, it will revert to using the tests listed in `testList.template.txt`.
 

## Requirements

For these tests to run, it is required to have a complete Discovery release of the Enigma Network deployed in a dockerized environment, and run these tests from the `client` container. See the [Discovery Integration Tests](https://github.com/enigmampc/discovery-integration-tests) repository for more details.
