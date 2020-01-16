# enigma-contract

| Branch | Build | Code Coverage | 
|--------|-------|---------------|
| Master | [![Build Status](https://travis-ci.org/enigmampc/enigma-contract.svg?branch=master)](https://travis-ci.org/enigmampc/enigma-contract) | [![codecov](https://codecov.io/gh/enigmampc/enigma-contract/branch/master/graph/badge.svg?token=mhsubU24ud)](https://codecov.io/gh/enigmampc/enigma-contract) |
| Develop | [![Build Status](https://travis-ci.org/enigmampc/enigma-contract.svg?branch=develop)](https://travis-ci.org/enigmampc/enigma-contract) | [![codecov](https://codecov.io/gh/enigmampc/enigma-contract/branch/develop/graph/badge.svg?token=mhsubU24ud)](https://codecov.io/gh/enigmampc/enigma-contract) |

The Solidity contracts and the [Javascript client library](enigma-js/) of the Enigma Network with a Truffle test bed. 

For more information, refer to the [Protocol documentation](https://enigma.co/protocol) for more information, as well as the [client library README](enigma-js/README.md).

## Configuration

The Enigma contract supports both Hardware and Software (aka Simulation) SGX modes for the enclaves running on the Engima network. The distinction comes when the enclaves register with the contract, when they must include a Remote Attestation report signed by Intel that verifies the enclaves credentials. In the case of Simulation mode that report is empty, and the contract skips the mandatory signature verifications enforced in Hardware mode.

Simulation mode is only supported for development purposes in environments without access to hosts with SGX capabilities. For security reasons, there are two different sets of contracts for Hardware and Software mode (instead of having a switch or conditional block inside the contract that will end on mainnet). The selection between either mode is conditional at the time of doing the contract migrations based on the environment variable `SGX_MODE`. Only when it is set to `SW`, the simulation mode will be enabled. In all other cases, it will run in Hardware mode.

For reference, an `.env-template` is provided that can be copied over to `.env` to manage the setting of this environment variable.

## Deployment on a live network

See `docs/DEPLOY.md` for step-by-step instructions.

## License

The Enigma Contract is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

You should have received a [copy](LICENSE) of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.
