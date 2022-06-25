const { ethers, network } = require("hardhat");
const fs = require("fs");

const FRONT_END_LOCATION_ADDRESSES_FILE =
    "../nextjs-hardhat-lottery/constants/contractAddress.json";
const FRONT_END_LOCATION_ABI_FILE =
    "../nextjs-hardhat-lottery/constants/abi.json";

module.exports = async function() {
    if (process.env.UPDATE_FRONT_END) {
        console.log("update front end....");
        updateContractAddresses();
        updateAbi();
    }
};

async function updateAbi() {
    const raffle = await ethers.getContract("Raffle");
    fs.writeFileSync(
        FRONT_END_LOCATION_ABI_FILE,
        raffle.interface.format(ethers.utils.FormatTypes.json)
    );
}

async function updateContractAddresses() {
    const raffle = await ethers.getContract("Raffle");
    const contractAddress = JSON.parse(
        fs.readFileSync(FRONT_END_LOCATION_ADDRESSES_FILE, "utf8")
    );

    const chainId = network.config.chainId.toString();

    if (chainId in contractAddress) {
        if (!contractAddress[chainId].includes(raffle.address)) {
            contractAddress[chainId].push(raffle.address);
        }
    } else {
        contractAddress[chainId] = [raffle.address];
    }

    fs.writeFileSync(
        FRONT_END_LOCATION_ADDRESSES_FILE,
        JSON.stringify(contractAddress)
    );
}

module.exports.tags = ["all", "frontend"];