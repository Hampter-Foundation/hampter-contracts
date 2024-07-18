import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { NFTStaking, HampterNFT } from "../typechain-types/";

describe("MultiNFTStaking", function () {
  let multiNFTStaking: NFTStaking;
  let mockNFT1: HampterNFT;
  let mockNFT2: HampterNFT;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const MultiNFTStakingFactory =
      await ethers.getContractFactory("NFTStaking");
    multiNFTStaking = await MultiNFTStakingFactory.deploy();

    const MockNFTFactory = await ethers.getContractFactory("HampterNFT");
    mockNFT1 = (await MockNFTFactory.deploy(
      5, // maxBatchSize
      100000, // collectionSize
      500 // amountForDevs
    )) as HampterNFT;

    mockNFT2 = (await MockNFTFactory.deploy(
      5, // maxBatchSize
      100000, // collectionSize
      500 // amountForDevs
    )) as HampterNFT;

    // Mint some NFTs for testing
    await mockNFT1.mint(user1.address, 1);
    await mockNFT1.mint(user1.address, 2);
    await mockNFT2.mint(user2.address, 1);
    await mockNFT2.mint(user2.address, 2);
  });

  describe("Constructor", function () {
    it("Should set the owner correctly", async function () {
      expect(await multiNFTStaking.owner()).to.equal(owner.address);
    });
  });

  describe("addCollection", function () {
    it("Should add a collection successfully", async function () {
      await expect(multiNFTStaking.addCollection(mockNFT1.address))
        .to.emit(multiNFTStaking, "CollectionAdded")
        .withArgs(mockNFT1.address);

      expect(await multiNFTStaking.allowedCollections(mockNFT1.address)).to.be
        .true;
    });

    it("Should revert if a non-owner tries to add a collection", async function () {
      await expect(
        multiNFTStaking.connect(user1).addCollection(mockNFT1.address)
      ).to.be.revertedWithCustomError(
        multiNFTStaking,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert if trying to add an already added collection", async function () {
      await multiNFTStaking.addCollection(mockNFT1.address);
      await expect(
        multiNFTStaking.addCollection(mockNFT1.address)
      ).to.be.revertedWith("Collection already added");
    });
  });

  describe("removeCollection", function () {
    beforeEach(async function () {
      await multiNFTStaking.addCollection(mockNFT1.address);
    });

    it("Should remove a collection successfully", async function () {
      await expect(multiNFTStaking.removeCollection(mockNFT1.address))
        .to.emit(multiNFTStaking, "CollectionRemoved")
        .withArgs(mockNFT1.address);

      expect(await multiNFTStaking.allowedCollections(mockNFT1.address)).to.be
        .false;
    });

    it("Should revert if a non-owner tries to remove a collection", async function () {
      await expect(
        multiNFTStaking.connect(user1).removeCollection(mockNFT1.address)
      ).to.be.revertedWithCustomError(
        multiNFTStaking,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert if trying to remove a non-existing collection", async function () {
      await expect(
        multiNFTStaking.removeCollection(mockNFT2.address)
      ).to.be.revertedWith("Collection not allowed");
    });
  });

  describe("stakeNFT", function () {
    beforeEach(async function () {
      await multiNFTStaking.addCollection(mockNFT1.address);
      await mockNFT1.connect(user1).approve(multiNFTStaking.address, 1);
    });

    it("Should stake an NFT successfully", async function () {
      await expect(multiNFTStaking.connect(user1).stakeNFT(mockNFT1.address, 1))
        .to.emit(multiNFTStaking, "NFTStaked")
        .withArgs(mockNFT1.address, 1, user1.address);

      const stakedNFT = await multiNFTStaking.stakedNFTs(mockNFT1.address, 1);
      expect(stakedNFT.owner).to.equal(user1.address);
    });

    it("Should revert if trying to stake from a non-allowed collection", async function () {
      await expect(
        multiNFTStaking.connect(user2).stakeNFT(mockNFT2.address, 1)
      ).to.be.revertedWith("Collection not allowed");
    });

    it("Should revert if trying to stake an already staked NFT", async function () {
      await multiNFTStaking.connect(user1).stakeNFT(mockNFT1.address, 1);
      await expect(
        multiNFTStaking.connect(user1).stakeNFT(mockNFT1.address, 1)
      ).to.be.revertedWith("NFT already staked");
    });
  });

  describe("unstakeNFT", function () {
    beforeEach(async function () {
      await multiNFTStaking.addCollection(mockNFT1.address);
      await mockNFT1.connect(user1).approve(multiNFTStaking.address, 1);
      await multiNFTStaking.connect(user1).stakeNFT(mockNFT1.address, 1);
    });

    it("Should unstake an NFT successfully", async function () {
      await expect(
        multiNFTStaking.connect(user1).unstakeNFT(mockNFT1.address, 1)
      )
        .to.emit(multiNFTStaking, "NFTUnstaked")
        .withArgs(mockNFT1.address, 1, user1.address);

      const stakedNFT = await multiNFTStaking.stakedNFTs(mockNFT1.address, 1);
      expect(stakedNFT.owner).to.equal(ethers.ZeroAddress);
    });

    it("Should revert if trying to unstake an NFT not owned by the caller", async function () {
      await expect(
        multiNFTStaking.connect(user2).unstakeNFT(mockNFT1.address, 1)
      ).to.be.revertedWith("Not the owner of this staked NFT");
    });
  });

  describe("getStakedNFTOwner", function () {
    beforeEach(async function () {
      await multiNFTStaking.addCollection(mockNFT1.address);
      await mockNFT1.connect(user1).approve(multiNFTStaking.address, 1);
      await multiNFTStaking.connect(user1).stakeNFT(mockNFT1.address, 1);
    });

    it("Should return the correct owner of a staked NFT", async function () {
      const owner = await multiNFTStaking.getStakedNFTOwner(
        mockNFT1.address,
        1
      );
      expect(owner).to.equal(user1.address);
    });

    it("Should return zero address for an unstaked NFT", async function () {
      const owner = await multiNFTStaking.getStakedNFTOwner(
        mockNFT1.address,
        2
      );
      expect(owner).to.equal(ethers.ZeroAddress);
    });
  });

  describe("getUserStakedNFTs", function () {
    beforeEach(async function () {
      await multiNFTStaking.addCollection(mockNFT1.address);
      await multiNFTStaking.addCollection(mockNFT2.address);
      await mockNFT1.connect(user1).approve(multiNFTStaking.address, 1);
      await mockNFT1.connect(user1).approve(multiNFTStaking.address, 2);
      await mockNFT2.connect(user1).approve(multiNFTStaking.address, 1);
      await multiNFTStaking.connect(user1).stakeNFT(mockNFT1.address, 1);
      await multiNFTStaking.connect(user1).stakeNFT(mockNFT1.address, 2);
      await multiNFTStaking.connect(user1).stakeNFT(mockNFT2.address, 1);
    });

    it("Should return all staked NFTs for a user", async function () {
      const stakedNFTs = await multiNFTStaking.getUserStakedNFTs(user1.address);
      expect(stakedNFTs.length).to.equal(3);
      expect(stakedNFTs[0].collection).to.equal(mockNFT1.address);
      expect(stakedNFTs[0].tokenId).to.equal(1);
      expect(stakedNFTs[1].collection).to.equal(mockNFT1.address);
      expect(stakedNFTs[1].tokenId).to.equal(2);
      expect(stakedNFTs[2].collection).to.equal(mockNFT2.address);
      expect(stakedNFTs[2].tokenId).to.equal(1);
    });

    it("Should return an empty array for a user with no staked NFTs", async function () {
      const stakedNFTs = await multiNFTStaking.getUserStakedNFTs(user2.address);
      expect(stakedNFTs.length).to.equal(0);
    });
  });
});
