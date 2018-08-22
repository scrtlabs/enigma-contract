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

## License

The Enigma Contract is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

You should have received a [copy](LICENSE) of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.
