const dotenv = require('dotenv');
const EnigmaToken = artifacts.require('EnigmaToken.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol');
const SecretContractImpl = artifacts.require('./impl/SecretContractImpl.sol');
const Sample = artifacts.require('Sample.sol');
const fs = require('fs');
const path = require('path');
const VotingETH = artifacts.require('VotingETH.sol');

const PRINCIPAL_SIGNING_ADDRESS = '0xa7595124f19a31b70a7d919ef8502ca5eb5e8225';
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
  }
}

async function doMigration(deployer) {
  await deployProtocol(deployer);
}

module.exports = function(deployer) {
  deployer.then(() => doMigration(deployer));
};
