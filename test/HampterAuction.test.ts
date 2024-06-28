import { expect } from "chai";
import { ethers } from "hardhat";
import { HampterNFT } from "../typechain-types/HampterAuction";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, Signer } from "ethers";
import { HampterAuction } from "../typechain-types";

// TODO: Try to break the code

describe("HampterAuction", function () {
  let auction: HampterAuction;
  let owner: Signer;
  let bidder1: Signer;
  let bidder2: Signer;
  let multisig: Signer;

  beforeEach(async function () {
    const HampterAuctionFactory =
      await ethers.getContractFactory("HampterAuction");
    [owner, bidder1, bidder2, multisig] = await ethers.getSigners();
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
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyStarted");
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

      const bidCount = await auction.getBidCount(await bidder1.getAddress());
      expect(bidCount).to.equal(1);
    });

    it("Should revert if the auction is not ongoing", async function () {
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);

      const bidAmount = ethers.parseEther("0.2");

      await expect(
        auction.connect(bidder1).placeBid({ value: bidAmount })
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyEnded");
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
      await expect(auction.endAuction()).to.be.revertedWithCustomError(
        auction,
        "AuctionNotOngoing"
      );
    });

    it("Should revert if a bid is placed after the auction has ended", async function () {
      const bidAmount = ethers.parseEther("0.2");

      await expect(
        auction.connect(bidder1).placeBid({ value: bidAmount })
      ).to.be.revertedWithCustomError(auction, "AuctionAlreadyEnded");
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

      await expect(
        auction.setWinners(winningBidIds)
      ).to.be.revertedWithCustomError(auction, "AuctionNotEnded");
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
      const bidder1BalanceBefore =
        await ethers.provider.getBalance(bidder1Address);

      await expect(auction.connect(bidder1).claimRefund(bidId))
        .to.emit(auction, "RefundClaimed")
        .withArgs(bidder1Address, ethers.parseEther("0.2"));

      const bidder1BalanceAfter =
        await ethers.provider.getBalance(bidder1Address);
      expect(bidder1BalanceAfter).to.be.gt(bidder1BalanceBefore);

      const bid = await auction.getBid(bidId);
      expect(bid.isClaimed).to.be.true;
    });

    it("Should revert if a winning bidder tries to claim refund", async function () {
      const bidId = BigInt(1);

      await expect(
        auction.connect(bidder2).claimRefund(bidId)
      ).to.be.revertedWithCustomError(auction, "WinnerCannotClaimRefund");
    });

    it("Should revert if a bidder tries to claim refund twice", async function () {
      const bidId = BigInt(0);

      await auction.connect(bidder1).claimRefund(bidId);

      await expect(
        auction.connect(bidder1).claimRefund(bidId)
      ).to.be.revertedWithCustomError(auction, "RefundAlreadyClaimed");
    });

    it("Should revert if a non-bidder tries to claim refund", async function () {
      const bidId = BigInt(0);

      await expect(
        auction.connect(owner).claimRefund(bidId)
      ).to.be.revertedWithCustomError(auction, "NotBidder");
    });
  });
  describe("withdrawWinningFunds", function () {
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
      const bidAmount3 = ethers.parseEther("0.1");

      // Fast forward to auction start time
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime]);
      await ethers.provider.send("evm_mine", []);

      await auction.connect(bidder1).placeBid({ value: bidAmount1 });
      await auction.connect(bidder2).placeBid({ value: bidAmount2 });
      await auction.connect(bidder1).placeBid({ value: bidAmount3 });

      // Fast forward to after auction end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await auction.endAuction();
    });
    // Test that the function can only be called by the owner.
    // Test that the function reverts if the auction state is not WinnersAnnounced.
    // Test that the function correctly calculates the total winning funds and updates the isClaimed status of winning bids.
    // Test that the function reverts if there are no winning funds to withdraw.
    // Test that the function successfully transfers the winning funds to the owner.
    // Test that the function emits the appropriate event(s) upon successful withdrawal.
    it("Should allow the owner to withdraw winning funds", async function () {
      const winningBidIds = [BigInt(0), BigInt(1)];
      await auction.setWinners(winningBidIds);

      const multisigAddress = await owner.getAddress();
      const multisigBalanceBefore =
        await ethers.provider.getBalance(multisigAddress);

      await expect(auction.withdrawWinningFunds())
        .to.emit(auction, "FundsWithdrawn")
        .withArgs(multisigAddress, ethers.parseEther("0.5")); // 0.2 + 0.3 = 0.6

      const multisigBalanceAfter =
        await ethers.provider.getBalance(multisigAddress);

      expect(multisigBalanceAfter - multisigBalanceBefore).to.be.closeTo(
        ethers.parseEther("0.5"),
        100000000000000n // accounting for gas fees
      );

      // expect contract to still have 0.1
      const contractBalance = await ethers.provider.getBalance(
        await auction.getAddress()
      );
      expect(contractBalance).to.equal(ethers.parseEther("0.1"));

      // expect winning bids to be marked as claimed
      const bid1 = await auction.getBid(0);
      expect(bid1.isClaimed).to.be.true;
      const bid2 = await auction.getBid(1);
      expect(bid2.isClaimed).to.be.true;
      const bid3 = await auction.getBid(2);
      expect(bid3.isClaimed).to.be.false;

      // bidder 1 can claim refund for bid 3
      await auction.connect(bidder1).claimRefund(BigInt(2));
      // check bidder 1 balance
      const bidder1Balance = await ethers.provider.getBalance(
        await bidder1.getAddress()
      );
      expect(bidder1Balance).to.be.gt(ethers.parseEther("0.1"));
    });

    it("Should revert if called by a non-owner", async function () {
      const winningBidIds = [BigInt(0), BigInt(1)];
      await auction.setWinners(winningBidIds);

      await expect(
        auction.connect(bidder1).withdrawWinningFunds()
      ).to.be.revertedWithCustomError(auction, "OwnableUnauthorizedAccount");
    });
  });

  describe("withdrawRemainingFunds", function () {
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

    it("Should allow the owner to withdraw remaining funds after 1 month", async function () {
      const winningBidIds = [BigInt(1)];
      await auction.setWinners(winningBidIds);
      await auction.withdrawWinningFunds();

      // Fast forward 1 month
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const multisigBalanceBefore = await ethers.provider.getBalance(
        await owner.getAddress()
      );

      await expect(auction.withdrawRemainingFunds())
        .to.emit(auction, "FundsWithdrawn")
        .withArgs(await owner.getAddress(), ethers.parseEther("0.2")); // Remaining funds: 0.2

      const multisigBalanceAfter = await ethers.provider.getBalance(
        await owner.getAddress()
      );
      expect(multisigBalanceAfter - multisigBalanceBefore).to.to.be.closeTo(
        ethers.parseEther("0.2"),
        100000000000000n // accounting for gas fees
      );
    });

    it("Should revert if called by a non-owner", async function () {
      const winningBidIds = [BigInt(1)];
      await auction.setWinners(winningBidIds);
      await auction.withdrawWinningFunds();

      await expect(
        auction.connect(bidder1).withdrawWinningFunds()
      ).to.be.revertedWithCustomError(auction, "OwnableUnauthorizedAccount");
    });

    it("Should revert if called before 1 month has passed", async function () {
      const winningBidIds = [BigInt(1)];
      await auction.setWinners(winningBidIds);
      await auction.withdrawWinningFunds();

      await expect(
        auction.withdrawRemainingFunds()
      ).to.be.revertedWithCustomError(auction, "TooEarlyForRemainingFunds");
    });
  });
});
