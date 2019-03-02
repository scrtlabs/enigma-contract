const dotenv = require('dotenv');
const EnigmaToken = artifacts.require('EnigmaToken.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol');
const PrincipalImpl = artifacts.require('./impl/PrincipalImpl.sol');
const TaskImpl = artifacts.require('./impl/TaskImpl.sol');
const SecretContractImpl = artifacts.require('./impl/SecretContractImpl.sol');
const Sample = artifacts.require('Sample.sol');
const fs = require('fs');
const path = require('path');

dotenv.config();    // Reads .env configuration file, if present

const Enigma = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
  artifacts.require('Enigma-Simulation.sol') :
  artifacts.require('Enigma.sol');
const WorkersImpl = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
  artifacts.require('./impl/WorkersImpl-Simulation.sol') :
  artifacts.require('./impl/WorkersImpl.sol');

async function deployProtocol(deployer) {
  await Promise.all([
    deployer.deploy(EnigmaToken),
    deployer.deploy(SolRsaVerify),
    deployer.deploy(WorkersImpl),
    deployer.deploy(SecretContractImpl),
  ]);

  await Promise.all([
    TaskImpl.link('WorkersImpl', WorkersImpl.address),
    PrincipalImpl.link('WorkersImpl', WorkersImpl.address),
  ]);
  await Promise.all([
    deployer.deploy(TaskImpl),
    deployer.deploy(PrincipalImpl),
  ]);

  await Promise.all([
    Enigma.link('WorkersImpl', WorkersImpl.address),
    Enigma.link('PrincipalImpl', PrincipalImpl.address),
    Enigma.link('TaskImpl', TaskImpl.address),
    Enigma.link('SecretContractImpl', SecretContractImpl.address),
  ]);

  let principal = '0xc44205c3aFf78e99049AfeAE4733a3481575CD26';
  const homedir = require('os').homedir();
  const principalSignAddrFile = path.join(homedir, '.enigma', 'principal-sign-addr.txt');
  if (fs.existsSync(principalSignAddrFile)) {
    principal = '0x' + fs.readFileSync(principalSignAddrFile, 'utf-8');
  }
  console.log('using account', principal, 'as principal signer');
  await deployer.deploy(Enigma, EnigmaToken.address, principal);
  await deployer.deploy(Sample);
}

async function doMigration(deployer) {
  await deployProtocol(deployer);
}

module.exports = function(deployer) {
  deployer.then(() => doMigration(deployer));
};
