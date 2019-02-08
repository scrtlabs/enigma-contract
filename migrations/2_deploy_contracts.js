const EnigmaToken = artifacts.require('EnigmaToken.sol');
const Enigma = artifacts.require('Enigma.sol');
const SolRsaVerify = artifacts.require('./utils/SolRsaVerify.sol');
const WorkersImpl = artifacts.require('./impl/WorkersImpl.sol');
const PrincipalImpl = artifacts.require('./impl/PrincipalImpl.sol');
const TaskImpl = artifacts.require('./impl/TaskImpl.sol');
const SecretContractImpl = artifacts.require('./impl/SecretContractImpl.sol');
const Sample = artifacts.require('Sample.sol');

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

  const principal = '0xc44205c3aFf78e99049AfeAE4733a3481575CD26';
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
