const dotenv = require('dotenv');
const EnigmaToken = artifacts.require('EnigmaToken.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol');
const SecretContractImpl = artifacts.require('./impl/SecretContractImpl.sol');
const Sample = artifacts.require('Sample.sol');
const ExchangeRate = artifacts.require('ExchangeRate.sol');
const fs = require('fs');
const path = require('path');
const VotingETH = artifacts.require('VotingETH.sol');

const PRINCIPAL_SIGNING_ADDRESS = '0x7de257a09705ad7a5652f7c89275b1ed74a7553c';
const DEBUG = true;
const ISVSVN = '0x0000';
const MRSIGNER = '0x83d719e77deaca1470f6baf62a4d774303c899db69020f9c70ee1dfc08c7ce9e';
const EPOCH_SIZE = 10;
const TIMEOUT_THRESHOLD = 2;

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
const UpgradeImpl = artifacts.require('./impl/UpgradeImpl.sol');

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
    deployer.deploy(UpgradeImpl),
  ]);

  await Promise.all([
    (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
      Enigma.link('WorkersImplSimulation', WorkersImpl.address) :
      Enigma.link('WorkersImpl', WorkersImpl.address),
    Enigma.link('PrincipalImpl', PrincipalImpl.address),
    Enigma.link('TaskImpl', TaskImpl.address),
    Enigma.link('UpgradeImpl', UpgradeImpl.address),
    Enigma.link('SecretContractImpl', SecretContractImpl.address),
  ]);

  let principal = PRINCIPAL_SIGNING_ADDRESS;
  const homedir = require('os').homedir();
  const principalSignAddrFile = path.join(homedir, '.enigma', 'principal-sign-addr.txt');
  if (fs.existsSync(principalSignAddrFile)) {
    principal = fs.readFileSync(principalSignAddrFile, 'utf-8');
  }
  console.log('using account', principal, 'as principal signer');
  await deployer.deploy(ExchangeRate);
  await deployer.deploy(Enigma, EnigmaToken.address, principal, ExchangeRate.address, EPOCH_SIZE, TIMEOUT_THRESHOLD,
      DEBUG, MRSIGNER, ISVSVN);
  await deployer.deploy(Sample);
  await deployer.deploy(VotingETH);

  if(fs.existsSync(path.join(homedir, '.enigma'))){
    // Writing enigma contracts to a file for other processes to retrieve, if ~/.enigma exists
    fs.writeFile(path.join(homedir, '.enigma', 'enigmacontract.txt'), Enigma.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'enigmatokencontract.txt'), EnigmaToken.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'votingcontract.txt'), VotingETH.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'samplecontract.txt'), Sample.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
  }
}

async function doMigration(deployer) {
  await deployProtocol(deployer);
}

module.exports = function(deployer) {
  deployer.then(() => doMigration(deployer));
};
