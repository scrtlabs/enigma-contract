let options = {
    networks: {
        development: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*" // Match any network id
        }
    }
};
let reporterArg = process.argv.indexOf('--reporter');
if (reporterArg >= 0) {
    options['mocha'] = {
        reporter: process.argv[reporterArg + 1]
    }
}

module.exports = options;