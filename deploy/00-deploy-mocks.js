const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25"); // premium link cost i.e 0.25 per request for random request
const GAS_PRICE_LINK = 1e9; //link per gas. calculated value based on the gas price of the chain

module.exports = async({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    const networkName = network.name;
    if (developmentChains.includes(networkName)) {
        log("Local network detected! Deploying mocks...");

        const args = [BASE_FEE, GAS_PRICE_LINK];

        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            args: args,
            log: true,
            waitConfirmations: network.config.blockConfirmations || 1,
        });

        log("Mock deployed!");
        log("---------------------------------------------------");
    }
};

module.exports.tags = ["all", "mocks"];