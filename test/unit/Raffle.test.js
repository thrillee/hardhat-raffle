const { assert, expect } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config");

!developmentChains.includes(network.name) ?
    describe.skip :
    describe("Raffle unit test", function() {
        let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
        const chainId = network.config.chainId;

        beforeEach(async() => {
            deployer = (await getNamedAccounts()).deployer;
            await deployments.fixture(["all"]);

            raffle = await ethers.getContract("Raffle", deployer);
            vrfCoordinatorV2Mock = await ethers.getContract(
                "VRFCoordinatorV2Mock",
                deployer
            );

            raffleEntranceFee = await raffle.getEntranceFee();
            interval = await raffle.getInterval();
        });

        describe("constructor", () => {
            it("initializes the raffle correctly", async() => {
                const raffleState = await raffle.getRaffleState();
                assert.equal(raffleState.toString(), "0");
                assert.equal(interval.toString(), networkConfig[chainId].interval);
            });
        });

        describe("enterRaffle", () => {
            it("reverts when you don't pay enough", async() => {
                await expect(raffle.enterRaffle()).to.be.revertedWith(
                    "Raffle__NotEnoughEthEntered"
                );
            });

            it("records player when they enter", async() => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                const playerFromContract = await raffle.getPlayer(0);
                assert.equal(playerFromContract, deployer);
            });

            it("emits event on enter", async() => {
                await expect(
                    raffle.enterRaffle({ value: raffleEntranceFee })
                ).to.emit(raffle, "raffleEnter");
            });

            it("denys entrance when raffle is calculating", async() => {
                await raffle.enterRaffle({ value: raffleEntranceFee });

                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);

                await network.provider.send("evm_mine", []);
                // Pretend to be a chainlink keeper
                await raffle.performUpkeep([]);

                await expect(
                    raffle.enterRaffle({ value: raffleEntranceFee })
                ).to.be.revertedWith("Raffle__NotOpen");
            });
        });

        describe("checkUpKeep", () => {
            it("returns false if people haven't sent any eth", async() => {
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);

                await network.provider.send("evm_mine", []);
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); // call Static is for simultating transactional calls
                assert(!upkeepNeeded);
            });

            it("returns false if raffle is not open", async() => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);

                await network.provider.send("evm_mine", []);
                await raffle.performUpkeep("0x"); // represent sending empty bytes

                const raffleState = await raffle.getRaffleState();
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); // call Static is for simultating transactional calls
                assert.equal(raffleState.toString(), "1");
                assert.equal(upkeepNeeded, false);
            });

            it("returns false if enough time hasn't passed", async() => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() - 1,
                ]);

                // await network.provider.send("evm_mine", []);
                await network.provider.request({ method: "evm_mine", params: [] });
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); // call Static is for simultating transactional calls
                assert(!upkeepNeeded);
            });

            it("returns true if enough time has passed", async() => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);

                await network.provider.request({ method: "evm_mine", params: [] });
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); // call Static is for simultating transactional calls
                assert(upkeepNeeded);
            });
        });

        describe("performUpKeep", () => {
            it("can only run if check if checkUpKeep is true", async() => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.request({ method: "evm_mine", params: [] });

                const tx = await raffle.performUpkeep("0x");
                assert(tx);
            });

            it("reverts when checkUpKeep is false", async() => {
                await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                    "Raffle__UpKeepNotNeeded"
                );
            });

            it("updates the raffle state and emits a requestId", async() => {
                // Too many asserts in this test!
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.request({ method: "evm_mine", params: [] });
                const txResponse = await raffle.performUpkeep("0x");
                const txReceipt = await txResponse.wait(1);
                const raffleState = await raffle.getRaffleState();
                const requestId = txReceipt.events[1].args.requestId;
                assert(requestId.toNumber() > 0);
                assert(raffleState == 1);
            });
        });

        describe("fullfillRandom words", () => {
            beforeEach(async() => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [
                    interval.toNumber() + 1,
                ]);
                await network.provider.request({ method: "evm_mine", params: [] });
            });

            it("can only be called after performUpKeep", async() => {
                const fullfillRequestId = 0;
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(
                        fullfillRequestId,
                        raffle.address
                    )
                ).to.be.revertedWith("nonexistent request");
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(
                        fullfillRequestId + 1,
                        raffle.address
                    )
                ).to.be.revertedWith("nonexistent request");
            });

            it("picks a winner, reset the lottery, sends money", async() => {
                const additionalEntrants = 3;
                const startingIndexAccountIndex = 1; // since deployer == 0
                const accounts = await ethers.getSigners();
                for (
                    let i = startingIndexAccountIndex; i < startingIndexAccountIndex + additionalEntrants; i++
                ) {
                    const accountConnectedRaffle = await raffle.connect(accounts[i]);
                    await accountConnectedRaffle.enterRaffle({
                        value: raffleEntranceFee,
                    });
                }

                const startingTimestamp = await raffle.getLatestTimestamp();

                //perform up keep (mock being chainlink Keepers)
                //fulfillRandomWords (mock being chainlink VRF)
                //we will have to wait for fullfillRandomWords to be called

                await new Promise(async(resolve, reject) => {
                    raffle.once("WinnerPicked", async() => {
                        console.log("Found the event!");
                        try {
                            const recentWinner = await raffle.getRecentWinner();
                            console.log("Selected Winner::" + recentWinner);
                            console.log("Account 0::" + accounts[0].address);
                            console.log("Account 1::" + accounts[1].address);
                            console.log("Account 2::" + accounts[2].address);
                            console.log("Account 3::" + accounts[3].address);
                            // console.log("Account 4::"+accounts[])
                            const raffleState = await raffle.getRaffleState();
                            const endingTimestamp = await raffle.getLatestTimestamp();
                            const numPlayers = await raffle.getNumberOfPlayer();
                            const winnerEndingBalance = await accounts[1].getBalance();
                            assert.equal(numPlayers.toString(), "0");
                            assert.equal(raffleState.toString(), "0");
                            assert(endingTimestamp > startingTimestamp);
                            assert.equal(
                                winnerEndingBalance.toString(),
                                winnerStartingBalance.add(
                                    raffleEntranceFee
                                    .mul(additionalEntrants)
                                    .add(raffleEntranceFee)
                                    .toString()
                                )
                            );
                        } catch (error) {
                            reject(error);
                        }
                        resolve();
                    });

                    const tx = await raffle.performUpkeep([]);
                    const txReceipt = await tx.wait(1);
                    const requestId = txReceipt.events[1].args.requestId;
                    const winnerStartingBalance = await accounts[1].getBalance();
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        requestId,
                        raffle.address
                    );
                });
            });
        });
    });