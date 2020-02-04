const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const EnigmaToken = artifacts.require('EnigmaToken.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol');
const SecretContractImpl = artifacts.require('./impl/SecretContractImpl.sol');
const ExchangeRate = artifacts.require('ExchangeRate.sol');
const Sample = artifacts.require('Sample.sol');
const VotingETH = artifacts.require('VotingETH.sol');

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

async function deployProtocol(deployer, network, accounts) {

  const ethSender = process.env.ETH_SENDER || accounts[0];

  if( ! TOKEN_ADDRESS ) {
    await deployer.deploy(EnigmaToken);
    TOKEN_ADDRESS = EnigmaToken.address;
  }

  console.log('Using Enigma Token contract: '+TOKEN_ADDRESS);

  await Promise.all([
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
    (typeof process.env.SGX_MODE !== 'undefined' && process.env.SGX_MODE == 'SW') ?
      Enigma.link('TaskImplSimulation', TaskImpl.address) :
      Enigma.link('TaskImpl', TaskImpl.address),
    Enigma.link('PrincipalImpl', PrincipalImpl.address),
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
  const exchangeRateContract = await ExchangeRate.deployed();
  await exchangeRateContract.setExchangeRate(EXCHANGE_RATE, {from: ethSender, gas: 300000});
  await deployer.deploy(Enigma, TOKEN_ADDRESS, principal, ExchangeRate.address, EPOCH_SIZE, TIMEOUT_THRESHOLD,
      SGX_DEBUG, SGX_MRSIGNER, SGX_ISVSVN);

  if (!network.includes('kovan')) {
    await deployer.deploy(Sample);
    await deployer.deploy(VotingETH);
  }

  console.log('Enigma contract deployed at '+Enigma.address);

  if(fs.existsSync(path.join(homedir, '.enigma'))){
    // Writing enigma contracts to a file for other processes to retrieve, if ~/.enigma exists
    fs.writeFile(path.join(homedir, '.enigma', 'enigmacontract.txt'), Enigma.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'enigmatokencontract.txt'), TOKEN_ADDRESS, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'ExchangeRate.txt'), ExchangeRate.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'SecretContractImpl.txt'), SecretContractImpl.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'PrincipalImpl.txt'), PrincipalImpl.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'SolRsaVerify.txt'), SolRsaVerify.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'TaskImpl.txt'), TaskImpl.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'UpgradeImpl.txt'), UpgradeImpl.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });
    fs.writeFile(path.join(homedir, '.enigma', 'WorkersImpl.txt'), WorkersImpl.address, 'utf8', function(err) {
      if(err) {
        return console.log(err);
      }
    });

    if (!network.includes('kovan')) {
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
}

async function doMigration(deployer, network, accounts) {
  await deployProtocol(deployer, network, accounts);
}

module.exports = function(deployer, network, accounts) {
  deployer.then(() => doMigration(deployer, network, accounts));
};
