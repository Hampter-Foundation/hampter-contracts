import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
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
      const currentTime = currentBlock?.timestamp ?? 0;
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
      const currentTime = currentBlock?.timestamp ?? 0;

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
      const currentTime = currentBlock?.timestamp ?? 0;

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

      await expect(auction.connect(bidder1).claimRefund(bidId, bidder1Address))
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
      const bidder2Address = await bidder2.getAddress();

      await expect(
        auction.connect(bidder2).claimRefund(bidId, bidder2Address)
      ).to.be.revertedWithCustomError(auction, "WinnerCannotClaimRefund");
    });

    it("Should revert if a bidder tries to claim refund twice", async function () {
      const bidId = BigInt(0);
      const bidder1Address = await bidder1.getAddress();

      await auction.connect(bidder1).claimRefund(bidId, bidder1Address);

      await expect(
        auction.connect(bidder1).claimRefund(bidId, bidder1Address)
      ).to.be.revertedWithCustomError(auction, "RefundAlreadyClaimed");
    });

    it("Should revert if a non-bidder tries to claim refund", async function () {
      const bidId = BigInt(0);
      const ownerAddress = await owner.getAddress();

      await expect(
        auction.connect(owner).claimRefund(bidId, ownerAddress)
      ).to.be.revertedWithCustomError(auction, "NotBidder");
    });
  });

  describe("claimRefunds", function () {
    let startTime: number;
    let endTime: number;
    beforeEach(async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp ?? 0;

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
      await auction.connect(bidder1).placeBid({ value: bidAmount1 });
      await auction.connect(bidder2).placeBid({ value: bidAmount2 });

      // Fast forward to after auction end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await auction.endAuction();

      const winningBidIds = [BigInt(2)];
      await auction.setWinners(winningBidIds);
    });

    it("Should allow a non-winning bidder to claim refund", async function () {
      const bidIds = [BigInt(0), BigInt(1)];
      const bidder1Address = await bidder1.getAddress();
      const bidder1BalanceBefore =
        await ethers.provider.getBalance(bidder1Address);

      await expect(
        auction.connect(bidder1).claimRefunds(bidIds, bidder1Address)
      )
        .to.emit(auction, "RefundClaimed")
        .withArgs(bidder1Address, ethers.parseEther("0.2"));

      const bidder1BalanceAfter =
        await ethers.provider.getBalance(bidder1Address);
      expect(bidder1BalanceAfter).to.be.gt(bidder1BalanceBefore);

      const bidOne = await auction.getBid(bidIds[0]);
      expect(bidOne.isClaimed).to.be.true;
      const bidTwo = await auction.getBid(bidIds[1]);
      expect(bidTwo.isClaimed).to.be.true;
    });

    it("Should revert if a winning bidder tries to claim refund", async function () {
      const bidId = BigInt(2);
      const bidder2Address = await bidder2.getAddress();

      await expect(
        auction.connect(bidder2).claimRefund(bidId, bidder2Address)
      ).to.be.revertedWithCustomError(auction, "WinnerCannotClaimRefund");
    });

    it("Should revert if a bidder tries to claim refund twice", async function () {
      const bidIds = [BigInt(0), BigInt(1)];
      const bidder1Address = await bidder1.getAddress();

      await auction.connect(bidder1).claimRefunds(bidIds, bidder1Address);

      await expect(
        auction.connect(bidder1).claimRefunds(bidIds, bidder1Address)
      ).to.be.revertedWithCustomError(auction, "RefundAlreadyClaimed");
    });

    it("Should revert if a bidder tries to claim refund individually then all at once", async function () {
      const bidIds = [BigInt(0), BigInt(1)];
      const bidder1Address = await bidder1.getAddress();

      await auction.connect(bidder1).claimRefund(bidIds[0], bidder1Address);

      await expect(
        auction.connect(bidder1).claimRefunds(bidIds, bidder1Address)
      ).to.be.revertedWithCustomError(auction, "RefundAlreadyClaimed");
    });

    it("Should revert if a non-bidder tries to claim refunds", async function () {
      const bidIds = [BigInt(0), BigInt(1)];
      const ownerAddress = await owner.getAddress();

      await expect(
        auction.connect(owner).claimRefunds(bidIds, ownerAddress)
      ).to.be.revertedWithCustomError(auction, "NotBidder");
    });
  });

  describe("withdrawWinningFunds", function () {
    let startTime: number;
    let endTime: number;

    beforeEach(async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp ?? 0;

      startTime = currentTime + 60; // Start auction after 1 minute
      endTime = startTime + 3600; // End auction 1 hour after it starts

      const minBid = ethers.parseEther("0.1");
      const minBidIncrement = ethers.parseEther("0.01");

      await auction.startAuction(startTime, endTime, minBid, minBidIncrement);

      const bidAmount1 = ethers.parseEther("0.2");
      const bidAmount2 = ethers.parseEther("0.3");
      const bidAmount3 = ethers.parseEther("0.4");
      const bidAmount4 = ethers.parseEther("0.5");

      // Fast forward to auction start time
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime]);
      await ethers.provider.send("evm_mine", []);

      await auction.connect(bidder1).placeBid({ value: bidAmount1 });
      await auction.connect(bidder2).placeBid({ value: bidAmount2 });
      await auction.connect(bidder1).placeBid({ value: bidAmount3 });
      await auction.connect(bidder2).placeBid({ value: bidAmount4 });

      // Fast forward to after auction end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await auction.endAuction();
    });

    it("Should allow the owner to withdraw winning funds in batches", async function () {
      const winningBidIds = [BigInt(0), BigInt(1), BigInt(2), BigInt(3)];
      await auction.setWinners(winningBidIds);

      const ownerAddress = await owner.getAddress();
      const ownerBalanceBefore = await ethers.provider.getBalance(ownerAddress);

      // Withdraw in two batches
      await expect(auction.withdrawWinningFunds(2))
        .to.emit(auction, "FundsWithdrawn")
        .withArgs(ownerAddress, ethers.parseEther("0.5")); // 0.2 + 0.3

      await expect(auction.withdrawWinningFunds(2))
        .to.emit(auction, "FundsWithdrawn")
        .withArgs(ownerAddress, ethers.parseEther("0.9")); // 0.4 + 0.5

      const ownerBalanceAfter = await ethers.provider.getBalance(ownerAddress);

      expect(ownerBalanceAfter - ownerBalanceBefore).to.be.closeTo(
        ethers.parseEther("1.4"),
        ethers.parseEther("0.01") // accounting for gas fees
      );

      // Expect all winning bids to be marked as claimed
      for (let i = 0; i < 4; i++) {
        const bid = await auction.getBid(BigInt(i));
        expect(bid.isClaimed).to.be.true;
      }

      // Attempt to withdraw again should revert
      await expect(
        auction.withdrawWinningFunds(1)
      ).to.be.revertedWithCustomError(auction, "NoWinningFunds");
    });

    it("Should handle incomplete batches correctly", async function () {
      const winningBidIds = [BigInt(0), BigInt(1)];
      await auction.setWinners(winningBidIds);

      const ownerAddress = await owner.getAddress();

      // Withdraw with a batch size larger than the number of winning bids
      await expect(auction.withdrawWinningFunds(3))
        .to.emit(auction, "FundsWithdrawn")
        .withArgs(ownerAddress, ethers.parseEther("0.5")); // 0.2 + 0.3

      // Attempt to withdraw again should revert
      await expect(
        auction.withdrawWinningFunds(1)
      ).to.be.revertedWithCustomError(auction, "NoWinningFunds");
    });

    it("Should revert if called by a non-owner", async function () {
      const winningBidIds = [BigInt(0), BigInt(1)];
      await auction.setWinners(winningBidIds);

      await expect(
        auction.connect(bidder1).withdrawWinningFunds(1)
      ).to.be.revertedWithCustomError(auction, "OwnableUnauthorizedAccount");
    });
    it("Should revert if winners are not announced", async function () {
      await expect(
        auction.withdrawWinningFunds(1)
      ).to.be.revertedWithCustomError(auction, "WinnersNotAnnounced");
    });

    it("Should handle large batch sizes correctly", async function () {
      const winningBidIds = [BigInt(0), BigInt(1), BigInt(2), BigInt(3)];
      await auction.setWinners(winningBidIds);

      const ownerAddress = await owner.getAddress();

      // Withdraw with a batch size larger than the number of bids
      await expect(auction.withdrawWinningFunds(10))
        .to.emit(auction, "FundsWithdrawn")
        .withArgs(ownerAddress, ethers.parseEther("1.4")); // 0.2 + 0.3 + 0.4 + 0.5

      // Attempt to withdraw again should revert
      await expect(
        auction.withdrawWinningFunds(1)
      ).to.be.revertedWithCustomError(auction, "NoWinningFunds");
    });
  });

  describe("withdrawRemainingFunds", function () {
    let startTime: number;
    let endTime: number;

    beforeEach(async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTime = currentBlock!.timestamp;

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
      const winningBidIds = [BigInt(1)]; // Bid 1 is the winner (0.3 ETH)
      await auction.setWinners(winningBidIds);

      // Withdraw winning funds
      await auction.withdrawWinningFunds(2); // Process all bids

      // Fast forward 1 month
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const ownerAddress = await owner.getAddress();
      const ownerBalanceBefore = await ethers.provider.getBalance(ownerAddress);

      await expect(auction.withdrawRemainingFunds())
        .to.emit(auction, "FundsWithdrawn")
        .withArgs(ownerAddress, ethers.parseEther("0.2")); // Remaining funds: 0.2

      const ownerBalanceAfter = await ethers.provider.getBalance(ownerAddress);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.be.closeTo(
        ethers.parseEther("0.2"),
        ethers.parseEther("0.01") // accounting for gas fees
      );
    });

    it("Should revert if called by a non-owner", async function () {
      const winningBidIds = [BigInt(1)];
      await auction.setWinners(winningBidIds);
      await auction.withdrawWinningFunds(2); // Process all bids

      // Fast forward 1 month
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        auction.connect(bidder1).withdrawRemainingFunds()
      ).to.be.revertedWithCustomError(auction, "OwnableUnauthorizedAccount");
    });

    it("Should revert if called before 1 month has passed", async function () {
      const winningBidIds = [BigInt(1)];
      await auction.setWinners(winningBidIds);
      await auction.withdrawWinningFunds(2); // Process all bids

      // Fast forward less than 1 month (e.g., 29 days)
      await ethers.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        auction.withdrawRemainingFunds()
      ).to.be.revertedWithCustomError(auction, "TooEarlyForRemainingFunds");
    });
  });
});
