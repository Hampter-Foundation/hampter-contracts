
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

  enum AuctionState { NotStarted, Ongoing, Ended, WinnersAnnounced, AirdropCompleted }

  // TODO: Perform gas optimization here
  Bid[] public bids;
  Auction public auction;
  mapping(address => uint256) public bidCounts;
  mapping(address => uint256[]) public bidderToBidIds;
  mapping(uint256 => uint256) public bidIdToBidsIndex; // mapping of bidId to index in bids array
  mapping (uint256 => bool) public validBidIds; // mapping of bidId that are valid
  uint32 immutable public maxBidPerAddress = 3; // Maximum that each address can bid - 3
  uint256 public nextBidId;

  constructor () Ownable(msg.sender) {
    auction = Auction(0, 0, 0, 0, AuctionState.NotStarted);
  }

  /**
   * @dev Starts the auction.
   * @param _startTime The start timestamp of the auction.
   * @param _endTime The end timestamp of the auction.
   * @param _minBid The minimum bid amount.
   */
  function startAuction(uint256 _startTime, uint256 _endTime, uint256 _minBid, uint256 _minBidIncrement) external onlyOwner {
    require(auction.auctionState == AuctionState.NotStarted, "Auction has already started");
    require(_startTime < _endTime, "Invalid start and end time");
    require(_endTime > block.timestamp, "End time must be in the future");
    require(_minBid > 0, "Minimum bid must be greater than 0");
    auction = Auction(_startTime, _endTime, _minBid, _minBidIncrement, AuctionState.Ongoing);
  }

  /**
   * @dev Ends the auction.
   */
  function endAuction() external onlyOwner {
    require(auction.auctionState == AuctionState.Ongoing, "Auction is not ongoing");
    auction.auctionState = AuctionState.Ended;
    emit AuctionEnded();
  }

  /// @dev Sets the winners of the auction 
  function setWinners(uint256[] memory _winningBidIds) external onlyOwner {
      require(auction.auctionState == AuctionState.Ended, "Auction is not ended");
      require(_winningBidIds.length > 0, "Winning bids cannot be empty");

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
  // TODO: Add denomination of the bid amount
  function placeBid() external payable {
    require(auction.auctionState == AuctionState.Ongoing, "Auction is not ongoing");
    require(block.timestamp >= auction.startTime, "Auction has not started yet");
    require(block.timestamp <= auction.endTime, "Auction has already ended");
    require(msg.value > 0, "Bid amount must be greater than 0");
    require(msg.value >= auction.minBid, "Bid amount must be greater than or equal to the minimum bid amount");
    require(msg.value % auction.bidDenomination == 0, "Bid amount must be a multiple of the bid denomination");
    require(bidCounts[msg.sender] <= maxBidPerAddress, "Bid limit reached");


    uint256 currentBidId = nextBidId;
    Bid memory newBid = Bid(msg.sender, msg.value, currentBidId, false, false);
    bids.push(newBid);
    bidIdToBidsIndex[currentBidId] = bids.length - 1; // Map the bid ID to the index of the bid in the bids array
    bidCounts[msg.sender]++;
    bidderToBidIds[msg.sender].push(currentBidId);
    nextBidId++;
    validBidIds[currentBidId] = true;


    emit BidPlaced(msg.sender, msg.value);
  }

  /// @dev Returns the bid details for a given bidId
  function getBid(uint256 bidId) public view returns (Bid memory) {
    uint256 bidIndex = bidIdToBidsIndex[bidId];
    return bids[bidIndex];
}

// NOTE: This is the most important function to secure
  function claimRefund(uint256 bidId) external nonReentrant {
    require(auction.auctionState == AuctionState.WinnersAnnounced, "Winners have not been announced");
    require(validBidIds[bidId], "Invalid bidId");

    Bid memory bid = getBid(bidId);
    require(bid.bidder == msg.sender, "Only the bidder can claim the refund");
    require(bid.isWinner == false, "Winners cannot claim refund");
    require(bid.isClaimed == false, "Refund has already been claimed");

    bid.isClaimed = true;
    payable(msg.sender).transfer(bid.amount); // TODO: Check if this is the right way to transfer funds

    emit RefundClaimed(msg.sender, bid.amount);
  }
}


// TODO: 
// 1. Tests
// 2. Fuzzing 
// 3. Static Analysis