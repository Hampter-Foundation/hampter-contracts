import { expect } from "chai";
import { ethers } from "hardhat";
import { HampterNFT } from "../typechain-types/HampterAuction";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, Signer } from "ethers";
import { HampterAuction } from "../typechain-types";

// TODO: Try to break the code

describe("HampterAuction", function () {
  let HampterAuction: HampterAuction;
  let auction: HampterAuction;
  let owner: Signer;
  let bidder1: Signer;
  let bidder2: Signer;

  beforeEach(async function () {
    const HampterAuctionFactory = await ethers.getContractFactory(
      "HampterAuction"
    );
    [owner, bidder1, bidder2] = await ethers.getSigners();
    auction = await HampterAuctionFactory.deploy();
  });

  describe("Constructor", function () {
    it("Should set the owner correctly", async function () {
      expect(await auction.owner()).to.equal(await owner.getAddress());
    });

    it("Should initialize the auction state correctly", async function () {
      const auctionState = await auction.auction();
      expect(auctionState.auctionState).to.equal(0); // NotStarted
    });
  });

  describe("startAuction", function () {
    it("Should start the auction correctly", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 60; // Start after 1 minute
      const endTime = startTime + 3600; // End after 1 hour
      const minBid = ethers.parseEther("0.1");
      const minBidIncrement = ethers.parseEther("0.01");

      await auction.startAuction(startTime, endTime, minBid, minBidIncrement);

      const auctionState = await auction.auction();
      expect(auctionState.startTime).to.equal(startTime);
      expect(auctionState.endTime).to.equal(endTime);
      expect(auctionState.minBid).to.equal(minBid);
      expect(auctionState.bidDenomination).to.equal(minBidIncrement);
      expect(auctionState.auctionState).to.equal(1); // Ongoing
    });

    it("Should revert if the auction has already started", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const endTime = startTime + 3600;
      const minBid = ethers.parseEther("0.1");
      const minBidIncrement = ethers.parseEther("0.01");

      await auction.startAuction(startTime, endTime, minBid, minBidIncrement);

      await expect(
        auction.startAuction(startTime, endTime, minBid, minBidIncrement)
      ).to.be.revertedWith("Auction has already started");
    });
  });

  describe("placeBid", function () {
    beforeEach(async function () {
      const startTime = Math.floor(Date.now() / 1000) + 60;
      const endTime = startTime + 3600;
      const minBid = ethers.parseEther("0.1");
      const minBidIncrement = ethers.parseEther("0.01");

      await auction.startAuction(startTime, endTime, minBid, minBidIncrement);
    });

    it("Should place a bid successfully", async function () {
      const bidAmount = ethers.parseEther("0.2");
      const startTime = Math.floor(Date.now() / 1000) + 60; // same as auction start time

      // Advance the block timestamp to start the auction
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime]);
      await ethers.provider.send("evm_mine", []);

      await expect(auction.connect(bidder1).placeBid({ value: bidAmount }))
        .to.emit(auction, "BidPlaced")
        .withArgs(await bidder1.getAddress(), bidAmount);

      const bidCount = await auction.bidCounts(await bidder1.getAddress());
      expect(bidCount).to.equal(1);
    });

    it("Should revert if the auction is not ongoing", async function () {
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);

      const bidAmount = ethers.parseEther("0.2");

      await expect(
        auction.connect(bidder1).placeBid({ value: bidAmount })
      ).to.be.revertedWith("Auction has already ended");
    });
  });

  describe("endAuction", function () {
    beforeEach(async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp;
      const startTime = currentTime + 60; // Start auction after 1 minute
      const endTime = startTime + 3600; // End auction 1 hour after it starts

      const minBid = ethers.parseEther("0.1");
      const minBidIncrement = ethers.parseEther("0.01");

      await auction.startAuction(startTime, endTime, minBid, minBidIncrement);

      // Fast forward the blockchain time to after the auction end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1000]);
      await ethers.provider.send("evm_mine", []);
    });

    it("Should end the auction successfully", async function () {
      await expect(auction.endAuction()).to.emit(auction, "AuctionEnded");

      const auctionState = await auction.auction();
      expect(auctionState.auctionState).to.equal(2); // Ended
    });

    it("Should revert if the Auction has already ended", async function () {
      // end the auction once
      await auction.endAuction();
      await expect(auction.endAuction()).to.be.revertedWith(
        "Auction is not ongoing"
      );
    });

    it("Should revert if a bid is placed after the auction has ended", async function () {
      const bidAmount = ethers.parseEther("0.2");

      // No need to set the next block timestamp again, as it was already set in the beforeEach hook

      await expect(
        auction.connect(bidder1).placeBid({ value: bidAmount })
      ).to.be.revertedWith("Auction has already ended");
    });
  });

  describe("setWinners", function () {
    let startTime: number;
    let endTime: number;

    beforeEach(async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp;

      startTime = currentTime + 60; // Start auction after 1 minute
      endTime = startTime + 3600; // End auction 1 hour after it starts

      const minBid = ethers.parseEther("0.1");
      const minBidIncrement = ethers.parseEther("0.01");

      await auction.startAuction(startTime, endTime, minBid, minBidIncrement);

      const bidAmount1 = ethers.parseEther("0.2");
      const bidAmount2 = ethers.parseEther("0.3");

      // Fast forward to auction start time
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime]);
      await ethers.provider.send("evm_mine", []);

      await auction.connect(bidder1).placeBid({ value: bidAmount1 });
      await auction.connect(bidder2).placeBid({ value: bidAmount2 });

      // Fast forward to after auction end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await auction.endAuction();
    });

    it("Should set the winners correctly", async function () {
      const winningBidIds = [BigInt(0), BigInt(1)];

      await expect(auction.setWinners(winningBidIds))
        .to.emit(auction, "WinnersAnnounced")
        .withArgs(winningBidIds);

      const auctionState = await auction.auction();
      expect(auctionState.auctionState).to.equal(3); // WinnersAnnounced

      const bid1 = await auction.getBid(0);
      expect(bid1.isWinner).to.be.true;

      const bid2 = await auction.getBid(1);
      expect(bid2.isWinner).to.be.true;
    });

    it("Should revert if the auction is not ended", async function () {
      const winningBidIds = [BigInt(0), BigInt(1)];
      await auction.resetAuction();

      await expect(auction.setWinners(winningBidIds)).to.be.revertedWith(
        "Auction is not ended"
      );
    });
  });

  describe("claimRefund", function () {
    let startTime: number;
    let endTime: number;
    beforeEach(async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp;

      startTime = currentTime + 60; // Start auction after 1 minute
      endTime = startTime + 3600; // End auction 1 hour after it starts
      const minBid = ethers.parseEther("0.1");
      const minBidDenomination = ethers.parseEther("0.01");

      await auction.startAuction(
        startTime,
        endTime,
        minBid,
        minBidDenomination
      );

      // Fast forward to auction start time
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime]);
      await ethers.provider.send("evm_mine", []);

      const bidAmount1 = ethers.parseEther("0.2");
      const bidAmount2 = ethers.parseEther("0.3");

      await auction.connect(bidder1).placeBid({ value: bidAmount1 });
      await auction.connect(bidder2).placeBid({ value: bidAmount2 });

      // Fast forward to after auction end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await auction.endAuction();

      const winningBidIds = [BigInt(1)];
      await auction.setWinners(winningBidIds);
    });

    it("Should allow a non-winning bidder to claim refund", async function () {
      const bidId = BigInt(0);
      const bidder1Address = await bidder1.getAddress();
      const bidder1BalanceBefore = await ethers.provider.getBalance(
        bidder1Address
      );

      await expect(auction.connect(bidder1).claimRefund(bidId))
        .to.emit(auction, "RefundClaimed")
        .withArgs(bidder1Address, ethers.parseEther("0.2"));

      const bidder1BalanceAfter = await ethers.provider.getBalance(
        bidder1Address
      );
      expect(bidder1BalanceAfter).to.be.gt(bidder1BalanceBefore);

      const bid = await auction.getBid(bidId);
      expect(bid.isClaimed).to.be.true;
    });

    it("Should revert if a winning bidder tries to claim refund", async function () {
      const bidId = BigInt(1);

      await expect(
        auction.connect(bidder2).claimRefund(bidId)
      ).to.be.revertedWith("Winners cannot claim refund");
    });

    it("Should revert if a bidder tries to claim refund twice", async function () {
      const bidId = BigInt(0);

      await auction.connect(bidder1).claimRefund(bidId);

      await expect(
        auction.connect(bidder1).claimRefund(bidId)
      ).to.be.revertedWith("Refund has already been claimed");
    });

    it("Should revert if a non-bidder tries to claim refund", async function () {
      const bidId = BigInt(0);

      await expect(
        auction.connect(owner).claimRefund(bidId)
      ).to.be.revertedWith("Only the bidder can claim the refund");
    });
  });
});
