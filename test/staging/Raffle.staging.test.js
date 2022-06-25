const { assert, expect } = require("chai");
const { network, getNamedAccounts, ethers } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

// Steps to test
// 1. get subId
// 2. deploy contract using the generated subId
// 3. register contract with chainliknk vrf and its subId
// 4. Register contract with chainlink keepers
// 5. Run staging test

developmentChains.includes(network.name) ?
    describe.skip :
    describe("Raffle staging test", function() {
        let raffle, raffleEntranceFee, deployer;

        beforeEach(async() => {
            deployer = (await getNamedAccounts()).deployer;

            raffle = await ethers.getContract("Raffle", deployer);

            raffleEntranceFee = await raffle.getEntranceFee();
        });

        describe("fullfillRandom words", () => {
            it("works with live chainlink Keepers and chainlink VRF, we get a random winner", async() => {
                const startingTimestamp = await raffle.getLatestTimestamp();
                const accounts = await ethers.getSigners();

                await new Promise(async(resolve, reject) => {
                    raffle.once("WinnerPicked", async() => {
                        console.log("Found the event!");

                        try {
                            // add asserts here
                            const recentWinner = await raffle.getRecentWinner();
                            const raffleState = await raffle.getRaffleState();
                            const winnerEndingBalance = await accounts[0].getBalance();
                            const endingTimestamp = await raffle.getLatestTimestamp();

                            await expect(raffle.getPlayer(0)).to.be.reverted;
                            assert.equal(recentWinner.toString(), accounts[0].address);
                            assert.equal(raffleState.toString(), "0");
                            assert.equal(
                                winnerEndingBalance.toString(),
                                winnerStartingBalance.add(raffleEntranceFee).toString()
                            );
                            assert(endingTimestamp > startingTimestamp);

                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });

                    const tx = await raffle.enterRaffle({
                        value: raffleEntranceFee,
                    });
                    await tx.wait(1);
                    const winnerStartingBalance = await accounts[0].getBalance();

                    // this code won't complete until the listener finishes
                });
            });
        });
    });