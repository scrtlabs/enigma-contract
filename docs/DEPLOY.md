# Deploy the Enigma Contract

This file documents how to deploy/migrate the Enigma Contract onto a public Ethereum network, for example Kovan in the case of Enigma tesnet.

1. Create `.env` from the supplied template:

	```bash
	cp .env-template .env
	```

2. If you don't already have one, open an account with [infura.io](https://infura.io), create a project, and copy your `PROJECT_ID` into an `.env` file as follows, as well as the mnemonic of your `sender` (⚠️ DO NOT EVER COMMIT THIS FILE INTO ANY REPO OF YOURS ⚠️, there is a line in the `.gitignore` of this repo for this purpose, do not override it!):

	```
	MNEMONIC="YOUR_STAKING_ADDRESS_MNEMONIC_HERE"
	ENDPOINT_KEY="PROJECT_ID"
	``` 

3. Set `ETH_SENDER` in `.env` with the Ethereum address that you configured in Infura in the previous step that you will use as the sender of the transactions that will deploy the various contracts. This address will become the `Enigma address` that will be the only one allowed to deploy secret contracts on the public network.

4. Adjust `EPOCH_SIZE` (in blocks) in `.env`. The default value of `10` is set for development environments, but otherwise too small for a public network, and at the time of this writing a reasonable value is `450` that translates to about `30 min`. To estimate this number, visit [kovan.etherscan.io/](https://kovan.etherscan.io/) and look at the duration of recent past blocks (about `4 s` at the time of this writing). Thus, 450 blocks x 4s/block = 1800 s = 30 min.

5. Set `PRINCIPAL_SIGNING_ADDRESS` with the signing address of the Key Management Node already deployed. The default value comes from a preset value for a development network, not valid in a public network.

6. If you want to deploy the **Enigma Token Contract** leave `TOKEN_ADDRESS` blank as it comes by default. If you would like to use an existing Enigma Token contract already deployed on the public network, set the `TOKEN_ADDRESS` to the already-deployed Enigma Token Contract address.

7. Only change the other parameters in `.env` if you know what you are doing. Otherwise, the default values should work well.

8. For now, delete `migrations/3_deploy_upgraded_contracts.js` or rename it to any other name without the `.js` extension to disable this file.

9. Make sure the folder `$HOME/.enigma` exists in your computer. When the migrations run, if this folder exists, it will write the addresses for all the contracts on one file for every contract. These files should later be uploaded to their respective testnet version folder in the [enigmampc/discovery-testnet](https://github.com/enigmampc/discovery-testnet) repo for future reference (for example [v1/contracts](https://github.com/enigmampc/discovery-testnet/tree/master/v1/contracts)).

10. You are encouraged to do a *dry-run* to make sure everything works as expected:

	```bash
	truffle migrate --reset --network kovan --dry-run
	```

11. When you are ready, run the actual migration:

	```bash
	truffle migrate --reset --network kovan
	```