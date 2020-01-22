const dotenv = require('dotenv');
const EnigmaToken = artifacts.require('EnigmaToken.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol');
const SecretContractImpl = artifacts.require('./impl/SecretContractImpl.sol');
const ExchangeRate = artifacts.require('ExchangeRate.sol');
const fs = require('fs');
const path = require('path');

dotenv.config();    // Reads .env configuration file, if present

const PRINCIPAL_SIGNING_ADDRESS = process.env.PRINCIPAL_SIGNING_ADDRESS || '0x7de257a09705ad7a5652f7c89275b1ed74a7553c';
const SGX_DEBUG = process.env.SGX_DEBUG || true;
const SGX_ISVSVN = process.env.SGX_ISVSVN || '0x0000';
const SGX_MRSIGNER = process.env.SGX_MRSIGNER || '0x83d719e77deaca1470f6baf62a4d774303c899db69020f9c70ee1dfc08c7ce9e';
const EPOCH_SIZE = process.env.EPOCH_SIZE || 10;
const TIMEOUT_THRESHOLD = process.env.TIMEOUT_THRESHOLD || 2;
const EXCHANGE_RATE = process.env.EXCHANGE_RATE || 164518;
var TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || false;


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

  if (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') {
      await Promise.all([
          TaskImplV2.link('WorkersImplSimulationV2', WorkersImplV2.address),
          PrincipalImplV2.link('WorkersImplSimulationV2', WorkersImplV2.address),
      ]);
  } else {
      await Promise.all([
          TaskImplV2.link('WorkersImplV2', WorkersImplV2.address),
          PrincipalImplV2.link('WorkersImplV2', WorkersImplV2.address),
      ]);
  }

  await Promise.all([
    deployer.deploy(TaskImplV2),
    deployer.deploy(PrincipalImplV2),
  ]);

  const enigmaAddress = (await Enigma.deployed()).address;
  const exchangeRateAddress = (await ExchangeRate.deployed()).address;
  const upgradeImplAddress = (await UpgradeImpl.deployed()).address;
  const secretContractImplAddress = (await SecretContractImpl.deployed()).address;
  if (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') {
      await Promise.all([
          EnigmaV2.link('WorkersImplSimulationV2', WorkersImplV2.address),
          EnigmaV2.link('PrincipalImplSimulationV2', PrincipalImplV2.address),
          EnigmaV2.link('TaskImplSimulationV2', TaskImplV2.address),
          EnigmaV2.link('UpgradeImpl', upgradeImplAddress),
          EnigmaV2.link('SecretContractImpl', secretContractImplAddress),
      ]);
  } else {
      await Promise.all([
          EnigmaV2.link('WorkersImplV2', WorkersImplV2.address),
          EnigmaV2.link('PrincipalImplV2', PrincipalImplV2.address),
          EnigmaV2.link('TaskImplV2', TaskImplV2.address),
          EnigmaV2.link('UpgradeImpl', upgradeImplAddress),
          EnigmaV2.link('SecretContractImpl', secretContractImplAddress),
      ]);
  }

  let principal = PRINCIPAL_SIGNING_ADDRESS;
  const homedir = require('os').homedir();
  const principalSignAddrFile = path.join(homedir, '.enigma', 'principal-sign-addr.txt');
  if (fs.existsSync(principalSignAddrFile)) {
    principal = fs.readFileSync(principalSignAddrFile, 'utf-8');
  }
  console.log('using account', principal, 'as principal signer');
  if( ! TOKEN_ADDRESS ) {
    TOKEN_ADDRESS = (await EnigmaToken.deployed()).address;
  }
  console.log('OLD ENIGMA ADDRESS PASSED INTO', enigmaAddress);
  await deployer.deploy(EnigmaV2, TOKEN_ADDRESS, principal, exchangeRateAddress, enigmaAddress, EPOCH_SIZE,
      TIMEOUT_THRESHOLD, SGX_DEBUG, SGX_MRSIGNER, SGX_ISVSVN);
}

async function doMigration(deployer) {
  await deployProtocol(deployer);
}

module.exports = function(deployer) {
  deployer.then(() => doMigration(deployer));
};
