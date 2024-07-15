// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract HampterAuction is Ownable, ReentrancyGuard {
    /**
     * @dev Struct representing a bid.
     * @param bidder The address of the bidder.
     * @param amount The amount of ETH bid by the bidder.
     * @param timestamp The id of the bid. This is used to track bids.
     */
    struct Bid {
        address bidder;
        uint256 amount;
        uint256 bidId;
        bool isWinner;
        bool isClaimed;
        uint256 timestamp;
    }

    /**
     * @dev Struct representing an auction.
     * @param startTime The start timestamp of the auction.
     * @param endTime The end timestamp of the auction.
     * @param minBid The minimum bid amount.
     * @param bidDenomination The denomination of the bid amount. For example, if the bid denomination is 0.01, then the bid amount in multiples of 0.010.
     * @param isEnded A boolean indicating whether the auction has ended.
     */
    struct Auction {
        uint256 startTime;
        uint256 endTime;
        uint256 minBid;
        uint256 bidDenomination;
        AuctionState auctionState;
    }

    /**
     * @dev Event emitted when a bid is placed.
     * @param bidder The address of the bidder.
     * @param amount The amount of ETH bid by the bidder.
     */
    event BidPlaced(address indexed bidder, uint256 amount);

    /**
     * @dev Event emitted when the auction ends.
     */
    event AuctionEnded();

    /**
     * @dev Event emitted when the auction is ended and the winners are announced.
     * @param winningBids The addresses of the winningBid.
     */
    event WinnersAnnounced(uint256[] winningBids);

    /**
     * @dev Event emitted when a refund is claimed.
     * @param bidder The address of the bidder.
     * @param amount The amount of ETH refunded to the bidder.
     */
    event RefundClaimed(address indexed bidder, uint256 amount);

    event FundsWithdrawn(address indexed owner, uint256 amount);

    enum AuctionState {
        NotStarted,
        Ongoing,
        Ended,
        WinnersAnnounced,
        AirdropCompleted
    }

    Bid[] public bids;
    Auction public auction;
    mapping(address => uint256[]) public bidderToBidIds;
    mapping(uint256 => uint256) public bidIdToBidsIndex; // mapping of bidId to index in bids array
    mapping(uint256 => bool) public validBidIds; // mapping of bidId that are valid
    uint32 public immutable maxBidPerAddress = 3; // Maximum that each address can bid - 3
    uint256 public nextBidId;

    // Custom Errors
        error AuctionAlreadyStarted();
    error InvalidStartEndTime();
    error EndTimeInPast();
    error MinBidTooLow();
    error AuctionNotOngoing();
    error AuctionNotEnded();
    error WinningBidsEmpty();
    error InvalidBidId();
    error AuctionNotStarted();
    error AuctionAlreadyEnded();
    error BidAmountTooLow();
    error BidAmountNotMultiple();
    error BidLimitReached();
    error WinnersNotAnnounced();
    error NotBidder();
    error WinnerCannotClaimRefund();
    error RefundAlreadyClaimed();
    error NoWinningFunds();
    error TooEarlyForRemainingFunds();
    error NoRemainingFunds();

    constructor() Ownable(msg.sender) {
        auction = Auction(0, 0, 0, 0, AuctionState.NotStarted);
    }

    /**
     * @dev Starts the auction.
     * @param _startTime The start timestamp of the auction.
     * @param _endTime The end timestamp of the auction.
     * @param _minBid The minimum bid amount.
     */
    function startAuction(
        uint256 _startTime,
        uint256 _endTime,
        uint256 _minBid,
        uint256 _minBidIncrement
    ) external onlyOwner {
        if (auction.auctionState != AuctionState.NotStarted) revert AuctionAlreadyStarted();
        if (_startTime >= _endTime) revert InvalidStartEndTime();
        if (_endTime <= block.timestamp) revert EndTimeInPast();
        if (_minBid == 0) revert MinBidTooLow();
        auction = Auction(
            _startTime,
            _endTime,
            _minBid,
            _minBidIncrement,
            AuctionState.Ongoing
        );
    }

    /**
     * @dev Ends the auction.
     */
    function endAuction() external onlyOwner {
        if (auction.auctionState != AuctionState.Ongoing) revert AuctionNotOngoing();

        auction.auctionState = AuctionState.Ended;
        emit AuctionEnded();
    }

    function resetAuction() external onlyOwner {
        auction = Auction(0, 0, 0, 0, AuctionState.NotStarted);
    }

    /// @dev Sets the winners of the auction
    function setWinners(uint256[] memory _winningBidIds) external onlyOwner {
        if (auction.auctionState != AuctionState.Ended) revert AuctionNotEnded();
        if (_winningBidIds.length == 0) revert WinningBidsEmpty();

        for (uint256 i = 0; i < _winningBidIds.length; i++) {
            uint256 bidId = _winningBidIds[i];
            require(validBidIds[bidId], "Invalid bidId");
            uint256 bidIndex = bidIdToBidsIndex[bidId];
            bids[bidIndex].isWinner = true;
        }

        auction.auctionState = AuctionState.WinnersAnnounced;
        emit WinnersAnnounced(_winningBidIds);
    }

    /**
     * @dev Places a bid in the auction.
     * Each bid is placed one at a time.
     * A bidder can place multiple bids as long as the total number of bids does not exceed the maximum bid limit.
     * A bidder cannot update or cancel a bid once it is placed.
     */
    // Question: Should bid amount be an input as well?
    function placeBid() external payable nonReentrant{
        if (auction.auctionState != AuctionState.Ongoing) revert AuctionNotOngoing();
        if (block.timestamp < auction.startTime) revert AuctionNotStarted();
        if (block.timestamp > auction.endTime) revert AuctionAlreadyEnded();
        if (msg.value < auction.minBid) revert BidAmountTooLow();
        if (msg.value % auction.bidDenomination != 0) revert BidAmountNotMultiple();
        if (getBidCount(msg.sender) == maxBidPerAddress) revert BidLimitReached();


        uint256 currentBidId = nextBidId;
        Bid memory newBid = Bid(
            msg.sender,
            msg.value,
            currentBidId,
            false,
            false,
            block.timestamp
        );
        bids.push(newBid);
        bidIdToBidsIndex[currentBidId] = bids.length - 1; // Map the bid ID to the index of the bid in the bids array
        bidderToBidIds[msg.sender].push(currentBidId);
        nextBidId++;
        validBidIds[currentBidId] = true;

        emit BidPlaced(msg.sender, msg.value);
    }

    /// @dev Returns the bid details for a given bidId
    function getBid(uint256 bidId) external view returns (Bid memory) {
        uint256 bidIndex = bidIdToBidsIndex[bidId];
        return bids[bidIndex];
    }

    // NOTE: This is the most important function to secure
    function claimRefund(uint256 bidId) external nonReentrant {
        if (auction.auctionState != AuctionState.WinnersAnnounced) revert WinnersNotAnnounced();
        if (!validBidIds[bidId]) revert InvalidBidId();

        uint256 bidIndex = bidIdToBidsIndex[bidId];
        Bid storage bid = bids[bidIndex]; // Use storage to get a reference to the actual storage
        if (bid.bidder != msg.sender) revert NotBidder(); // Check if the caller is the bidder
        if (bid.isWinner) revert WinnerCannotClaimRefund();
        if (bid.isClaimed) revert RefundAlreadyClaimed();

        bid.isClaimed = true;
        payable(msg.sender).transfer(bid.amount); 

        emit RefundClaimed(msg.sender, bid.amount);
    }

    /// @dev Allows the owner to withdraw the winning funds after the auction has ended
    function withdrawWinningFunds() external onlyOwner {
        if (auction.auctionState != AuctionState.WinnersAnnounced) revert WinnersNotAnnounced();

        uint256 winningFunds;
        for (uint256 i = 0; i < bids.length; i++) {
            if (bids[i].isWinner && !bids[i].isClaimed) {
                winningFunds += bids[i].amount;
                bids[i].isClaimed = true;
            }
        }

        if (winningFunds == 0) revert NoWinningFunds();
        payable(owner()).transfer(winningFunds);
        emit FundsWithdrawn(owner(), winningFunds);
    }

    /// @dev Allows the owner to withdraw remaining funds 1 month after the auction has ended
    function withdrawRemainingFunds() external onlyOwner {
        if (auction.auctionState != AuctionState.WinnersAnnounced) revert WinnersNotAnnounced();
        if (block.timestamp < auction.endTime + 30 days) revert TooEarlyForRemainingFunds();

        uint256 remainingFunds = address(this).balance;
        require(remainingFunds > 0, "No remaining funds to withdraw");

        payable(owner()).transfer(remainingFunds);
        emit FundsWithdrawn(owner(), remainingFunds);
    }
        
     /// @dev Returns the number of bids placed by a bidder.
    function getBidCount(address bidder) public view returns (uint256) {
        return bidderToBidIds[bidder].length;
    }
}