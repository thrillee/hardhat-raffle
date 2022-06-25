//SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Raffle__UpKeepNotNeeded(
    uint256 currentBalance,
    uint256 totalplayer,
    uint256 raffleState
);
error Raffle__NotEnoughEthEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();

/** @title  A Sample Lottery Contract
 * @author Oluwatobi bello
 * @notice This contract is for creating an untermperable decentralized smart contract
 * @dev this implements chainlink VRFCoordinatorV2Interface, KeeperCompatibleInterface
 */
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    enum RaffleState {
        OPEN,
        CALCULATING
    }

    uint256 private immutable i_entranceFee;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callBackGasLimit;
    uint256 private immutable i_interval;

    address private s_recentWinner;
    address payable[] private s_players;
    RaffleState private s_raffleState;
    uint256 private s_lastTimestamp;

    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    event raffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callBackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_gasLane = gasLane;
        i_entranceFee = entranceFee;
        i_subscriptionId = subscriptionId;
        i_callBackGasLimit = callBackGasLimit;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_interval = interval;
        s_raffleState = RaffleState.OPEN;
        s_lastTimestamp = block.timestamp;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughEthEntered();
        }

        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }

        s_players.push(payable(msg.sender));

        emit raffleEnter(msg.sender);
    }

    /*
     * @dev This is the function chainlink keeprs call
     * 1. Lottery should have at least one player
     * 2. Time interval should have passed
     * 3. Subscription link is funded
     * 4. Lottery in should in an open state
     */
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        bool timePassed = ((block.timestamp - s_lastTimestamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpKeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }

        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, // gas lane: max price to pay for random number in wei
            i_subscriptionId, //subscription id is used for funding the request to pay the link oracle gas
            REQUEST_CONFIRMATIONS, // how many requet should the contract wait before return
            i_callBackGasLimit, // how much computation
            NUM_WORDS
        );
        emit RequestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        s_lastTimestamp = block.timestamp;

        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }

        emit WinnerPicked(recentWinner);
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayer() public view returns (uint256) {
        return s_players.length;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getLatestTimestamp() public view returns (uint256) {
        return s_lastTimestamp;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 playerIndex) public view returns (address) {
        return s_players[playerIndex];
    }
}
