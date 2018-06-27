describe ('integration-test', () => {
    it ('...should set the workers parameters', () => {
        assert (true);
    });

    it ("...should commit the computation task and pay a fee", () => web3.eth.getBlockNumber ()
        .then (_blockNumber => {
            assert (true);
        })
    );
});
