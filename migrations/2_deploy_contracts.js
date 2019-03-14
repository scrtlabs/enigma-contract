const dotenv = require('dotenv');
const EnigmaToken = artifacts.require('EnigmaToken.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol');
const SecretContractImpl = artifacts.require('./impl/SecretContractImpl.sol');
const Sample = artifacts.require('Sample.sol');
const fs = require('fs');
const path = require('path');

const PRINCIPAL_SIGNING_ADDRESS = '0x3078356633353161633136306365333763653066';
const EPOCH_SIZE = 10;

dotenv.config();    // Reads .env configuration file, if present

const Enigma = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
  artifacts.require('EnigmaSimulation.sol') :
  artifacts.require('Enigma.sol');
const WorkersImpl = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
  artifacts.require('./impl/WorkersImplSimulation.sol') :
  artifacts.require('./impl/WorkersImpl.sol');
const PrincipalImpl = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
  artifacts.require('./impl/PrincipalImplSimulation.sol') :
  artifacts.require('./impl/PrincipalImpl.sol');
const TaskImpl = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
  artifacts.require('./impl/TaskImplSimulation.sol') :
  artifacts.require('./impl/TaskImpl.sol');

async function deployProtocol(deployer) {
  await Promise.all([
    deployer.deploy(EnigmaToken),
    deployer.deploy(SolRsaVerify),
    deployer.deploy(WorkersImpl),
    deployer.deploy(SecretContractImpl),
  ]);

  if (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') {
    await Promise.all([
      TaskImpl.link('WorkersImplSimulation', WorkersImpl.address),
      PrincipalImpl.link('WorkersImplSimulation', WorkersImpl.address),
    ]);
  } else {
    await Promise.all([
      TaskImpl.link('WorkersImpl', WorkersImpl.address),
      PrincipalImpl.link('WorkersImpl', WorkersImpl.address),
    ]);
  }

  await Promise.all([
    deployer.deploy(TaskImpl),
    deployer.deploy(PrincipalImpl),
  ]);

  await Promise.all([
    (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
      Enigma.link('WorkersImplSimulation', WorkersImpl.address) :
      Enigma.link('WorkersImpl', WorkersImpl.address),
    Enigma.link('PrincipalImpl', PrincipalImpl.address),
    Enigma.link('TaskImpl', TaskImpl.address),
    Enigma.link('SecretContractImpl', SecretContractImpl.address),
  ]);

  let principal = PRINCIPAL_SIGNING_ADDRESS;
  const homedir = require('os').homedir();
  const principalSignAddrFile = path.join(homedir, '.enigma', 'principal-sign-addr.txt');
  if (fs.existsSync(principalSignAddrFile)) {
    principal = fs.readFileSync(principalSignAddrFile, 'utf-8');
  }
  console.log('using account', principal, 'as principal signer');
  await deployer.deploy(Enigma, EnigmaToken.address, principal, EPOCH_SIZE);
  await deployer.deploy(Sample);
}

async function doMigration(deployer) {
  await deployProtocol(deployer);
}

module.exports = function(deployer) {
  deployer.then(() => doMigration(deployer));
};
