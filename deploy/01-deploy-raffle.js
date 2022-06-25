const { network, ethers } = require("hardhat");
const {
    developmentChains,
    networkConfig,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

const SUBSCRIPTION_FUND_AMOUNT = ethers.utils.parseEther("30");

module.exports = async({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;
    const networkName = network.name;

    let vrfCoordinatorV2Address, subscriptionId;

    if (developmentChains.includes(networkName)) {
        const vrfCoordinatorV2Mock = await ethers.getContract(
            "VRFCoordinatorV2Mock"
        );
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;

        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
        const transactionReceipt = await transactionResponse.wait(1);

        subscriptionId = transactionReceipt.events[0].args.subId;
        await vrfCoordinatorV2Mock.fundSubscription(
            subscriptionId,
            SUBSCRIPTION_FUND_AMOUNT
        );
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
        subscriptionId = networkConfig[chainId]["subscriptionId"];
    }

    const entranceFee = networkConfig[chainId]["entranceFee"];
    const gasLane = networkConfig[chainId]["gasLane"];
    const callBackGasLimit = networkConfig[chainId]["callBackGasLimit"];
    const interval = networkConfig[chainId]["interval"];

    const constructorArgs = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscriptionId,
        callBackGasLimit,
        interval,
    ];

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: constructorArgs,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    });

    if (!developmentChains.includes(networkName) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        log("Verifying...");
        await verify(raffle.address, constructorArgs);
    }

    log("----------------------------");
};

module.exports.tags = ["all", "raffle"];