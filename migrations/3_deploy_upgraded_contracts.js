const dotenv = require('dotenv');
const EnigmaToken = artifacts.require('EnigmaToken.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol');
const SecretContractImpl = artifacts.require('./impl/SecretContractImpl.sol');
const fs = require('fs');
const path = require('path');

const PRINCIPAL_SIGNING_ADDRESS = '0xa7595124f19a31b70a7d919ef8502ca5eb5e8225';
const EPOCH_SIZE = 10;

dotenv.config();    // Reads .env configuration file, if present

const Enigma = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
    artifacts.require('./EnigmaSimulation.sol') :
    artifacts.require('./Enigma.sol');
const EnigmaV2 = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
    artifacts.require('./upgrade-mock/EnigmaSimulationV2.sol') :
    artifacts.require('./upgrade-mock/EnigmaV2.sol');
const WorkersImplV2 = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
    artifacts.require('./upgrade-mock/impl/WorkersImplSimulationV2.sol') :
    artifacts.require('./upgrade-mock/impl/WorkersImplV2.sol');
const PrincipalImplV2 = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
    artifacts.require('./upgrade-mock/impl/PrincipalImplSimulationV2.sol') :
    artifacts.require('./upgrade-mock/impl/PrincipalImplV2.sol');
const TaskImplV2 = (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
    artifacts.require('./upgrade-mock/impl/TaskImplSimulationV2.sol') :
    artifacts.require('./upgrade-mock/impl/TaskImplV2.sol');
const UpgradeImpl = artifacts.require('./impl/UpgradeImpl.sol');

async function deployProtocol(deployer) {
  await Promise.all([
    deployer.deploy(WorkersImplV2),
    deployer.deploy(SecretContractImpl),
  ]);

  await Promise.all([
    TaskImplV2.link('WorkersImplV2', WorkersImplV2.address),
    PrincipalImplV2.link('WorkersImplV2', WorkersImplV2.address),
  ]);

  await Promise.all([
    deployer.deploy(TaskImplV2),
    deployer.deploy(PrincipalImplV2),
  ]);

  const enigmaAddress = (await Enigma.deployed()).address;
  const upgradeImplAddress = (await UpgradeImpl.deployed()).address;
  const secretContractImplAddress = (await SecretContractImpl.deployed()).address;
  await Promise.all([
    EnigmaV2.link('WorkersImplV2', WorkersImplV2.address),
    EnigmaV2.link('PrincipalImplV2', PrincipalImplV2.address),
    EnigmaV2.link('TaskImplV2', TaskImplV2.address),
    EnigmaV2.link('UpgradeImpl', upgradeImplAddress),
    EnigmaV2.link('SecretContractImpl', secretContractImplAddress),
  ]);

  let principal = PRINCIPAL_SIGNING_ADDRESS;
  const homedir = require('os').homedir();
  const principalSignAddrFile = path.join(homedir, '.enigma', 'principal-sign-addr.txt');
  if (fs.existsSync(principalSignAddrFile)) {
    principal = fs.readFileSync(principalSignAddrFile, 'utf-8');
  }
  console.log('using account', principal, 'as principal signer');
  const enigmaTokenAddress = (await EnigmaToken.deployed()).address;
  console.log('OLD ENIGMA ADDRESS PASSED INTO', enigmaAddress);
  await deployer.deploy(EnigmaV2, enigmaTokenAddress, principal, enigmaAddress, EPOCH_SIZE);
}

async function doMigration(deployer) {
  await deployProtocol(deployer);
}

module.exports = function(deployer) {
  deployer.then(() => doMigration(deployer));
};
