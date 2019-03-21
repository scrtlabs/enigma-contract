import Docker from 'dockerode';
import web3Utils from 'web3-utils';
import msgpack from 'msgpack-lite';
import EthCrypto from 'eth-crypto';
import utils from '../src/enigma-utils';

const docker = new Docker();
exports.execInContainer = (enigma, commandOption, resetEpochState = false) => {
  let container = docker.getContainer(process.env.PRINCIPAL_CONTAINER);
  return new Promise((resolve, reject) => {
    const contractAddress = enigma.enigmaContract.options.address.substring(2);
    const epochStateOption = (resetEpochState) ? '-s' : '';
    const cmd = ['bash', '-c', `./enigma-principal-app ${commandOption} ${epochStateOption} -c ${contractAddress}`];
    const cmdStr = cmd.join(' ');
    console.log('Calling:\n', cmdStr);
    container.exec(
      {
        Cmd: cmd,
        AttachStdin: true,
        AttachStdout: true,
        WorkingDir: '/root/src/enigma-principal/bin',
      }, (err, exec) => {
        exec.start({hijack: true, stdin: true}, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          let out = '';
          stream.on('data', (line) => {
            out += line;
          });
          stream.on('error', (err) => {
            out += err;
          });
          stream.on('end', () => {
            const txFrom = out.lastIndexOf('0x');
            const txLen = out.length - txFrom;
            console.log(`Called cmd ${cmdStr}:\n${out}`);
            if (txLen === 67) {
              const tx = out.substr(txFrom);
              resolve(tx);
            } else {
              reject(`Unable to call command ${commandOption} from the Principal node container: ${out}`);
            }
          });
        });
      });
  });
};

exports.getStateKeysInContainer = (enigma, worker, scAddrs) => {
  let container = docker.getContainer(process.env.PRINCIPAL_CONTAINER);
  const identity = EthCrypto.createIdentity();
  let pubkey = [];
  for (let n = 0; n < identity.publicKey.length; n += 2) {
    pubkey.push(parseInt(identity.publicKey.substr(n, 2), 16));
  }
  const buffer = msgpack.encode({
    prefix: Buffer.from('Enigma Message'),
    data: {Request: scAddrs.map((a) => web3Utils.hexToBytes(a))},
    pubkey: pubkey,
  });
  const msg = buffer.toString('hex');
  const signature = EthCrypto.sign(worker[4], web3Utils.soliditySha3({
    t: 'bytes',
    value: msg,
  }));
  const params = JSON.stringify([msg, utils.remove0x(signature)]);
  return new Promise((resolve, reject) => {
    const contractAddress = enigma.enigmaContract.options.address.substring(2);
    const cmd = ['bash', '-c', `./enigma-principal-app -k ${params} -c ${contractAddress}`];
    const cmdStr = cmd.join(' ');
    console.log('Calling:\n', cmdStr);
    container.exec(
      {
        Cmd: cmd,
        AttachStdin: true,
        AttachStdout: true,
        WorkingDir: '/root/src/enigma-principal/bin',
      }, (err, exec) => {
        exec.start({hijack: true, stdin: true}, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          let out = '';
          stream.on('data', (line) => {
            out += line;
          });
          stream.on('error', (err) => {
            out += err;
          });
          stream.on('end', () => {
            console.log(`Called cmd ${cmdStr}:\n${out}`);
            const from = out.lastIndexOf('{"data"');
            if (from != -1) {
              const response = out.substr(from);
              resolve(response);
            } else {
              reject(`Unable to setStateKeys from the Principal node container: ${out}`);
            }
          });
        });
      });
  });
};
