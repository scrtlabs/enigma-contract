require ('@babel/register') ({
    ignore: [ /node_modules\/(?!openzeppelin-solidity\/test\/helpers)/ ]
});
require ("core-js/stable");
require ("regenerator-runtime/runtime");

// See <http://truffleframework.com/docs/advanced/configuration>
// to customize your Truffle configuration!
module.exports = {
    networks: {
        develop: {
            host: 'localhost',
            port: 9545,
            network_id: '4447' // Match ganache network id
        },
        // This network section is needed for travis-ci, do not remove
        ganache: {
            host: "127.0.0.1",
            port: 8545,
            network_id: "2"
        },
        // This network section is needed for travis-ci, do not remove
        ganache_remote: {
            host: "localhost",
            port: 30000,
            network_id: "3"
        },
        // This network section is needed for drone.io, do not remove
        drone: {
            host: 'ganache',
            port: 9545,
            network_id: '4447'
        }
    },
    solc: {
        // Turns on the Solidity optimizer. For development the optimizer's
        // quite helpful, just remember to be careful, and potentially turn it
        // off, for live deployment and/or audit time. For more information,
        // see the Truffle 4.0.0 release notes.
        //
        // https://github.com/trufflesuite/truffle/releases/tag/v4.0.0
        optimizer: {
            enabled: true,
            runs: 200
        }
    }
}
