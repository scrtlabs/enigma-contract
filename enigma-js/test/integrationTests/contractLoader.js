import dotenv from 'dotenv';

import EnigmaTokenContract from '../../../build/contracts/EnigmaToken';
import SampleContract from '../../../build/contracts/Sample';

dotenv.config();

var EnigmaContract = null;
if (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') {
  EnigmaContract = require('../../../build/contracts/EnigmaSimulation');
} else {
  EnigmaContract = require('../../../build/contracts/Enigma'); 
}

export {EnigmaContract, EnigmaTokenContract, SampleContract}