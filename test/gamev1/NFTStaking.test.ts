import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { NFTStaking, HampterNFT } from "../typechain-types/";

describe("NFTStaking", function () {
  let nftStaking: NFTStaking;
  let mockNFT1: HampterNFT;
  let mockNFT2: HampterNFT;
  let mockNFT3: HampterNFT;
  let mockNFT4: HampterNFT;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const nftStakingFactory = await ethers.getContractFactory("NFTStaking");
    nftStaking = await nftStakingFactory.deploy();

    const MockNFTFactory = await ethers.getContractFactory("HampterNFT");
    mockNFT1 = (await MockNFTFactory.deploy(
      1, // maxBatchSize
      100000, // collectionSize
      500 // amountForDevs
    )) as HampterNFT;

    mockNFT2 = (await MockNFTFactory.deploy(
      1, // maxBatchSize
      100000, // collectionSize
      500 // amountForDevs
    )) as HampterNFT;

    const user1Address = await user1.getAddress();
    const user2Address = await user2.getAddress();

    mockNFT3 = (await MockNFTFactory.deploy(
      1, // maxBatchSize
      100000, // collectionSize
      500 // amountForDevs
    )) as HampterNFT;

    mockNFT4 = (await MockNFTFactory.deploy(
      1, // maxBatchSize
      100000, // collectionSize
      500 // amountForDevs
    )) as HampterNFT;

    // Mint some NFTs for testing
    await mockNFT1.mint(user1Address, 1);
    await mockNFT1.mint(user1Address, 2);
    await mockNFT2.mint(user2Address, 1);
    await mockNFT2.mint(user2Address, 2);
    await mockNFT2.mint(user1Address, 1);
  });

  describe("Constructor", function () {
    it("Should set the owner correctly", async function () {
      expect(await nftStaking.owner()).to.equal(await owner.getAddress());
    });
  });

  describe("addCollection", function () {
    it("Should add a collection successfully", async function () {
      await expect(nftStaking.addCollection(await mockNFT1.getAddress()))
        .to.emit(nftStaking, "CollectionAdded")
        .withArgs(await mockNFT1.getAddress());

      expect(await nftStaking.allowedCollections(await mockNFT1.getAddress()))
        .to.be.true;
    });

    it("Should revert if a non-owner tries to add a collection", async function () {
      await expect(
        nftStaking.connect(user1).addCollection(await mockNFT1.getAddress())
      ).to.be.revertedWithCustomError(nftStaking, "OwnableUnauthorizedAccount");
    });

    it("Should revert if trying to add an already added collection", async function () {
      await nftStaking.addCollection(await mockNFT1.getAddress());
      await expect(
        nftStaking.addCollection(await mockNFT1.getAddress())
      ).to.be.revertedWith("Collection already added");
    });
  });

  describe("removeCollection", function () {
    beforeEach(async function () {
      await nftStaking.addCollection(await mockNFT1.getAddress());
    });

    it("Should remove a collection successfully", async function () {
      await expect(nftStaking.removeCollection(await mockNFT1.getAddress()))
        .to.emit(nftStaking, "CollectionRemoved")
        .withArgs(await mockNFT1.getAddress());

      expect(await nftStaking.allowedCollections(await mockNFT1.getAddress()))
        .to.be.false;
    });

    it("Should revert if a non-owner tries to remove a collection", async function () {
      await expect(
        nftStaking.connect(user1).removeCollection(await mockNFT1.getAddress())
      ).to.be.revertedWithCustomError(nftStaking, "OwnableUnauthorizedAccount");
    });

    it("Should revert if trying to remove a non-existing collection", async function () {
      await expect(
        nftStaking.removeCollection(await mockNFT2.getAddress())
      ).to.be.revertedWith("Collection not allowed");
    });
  });

  describe("stakeNFT", function () {
    beforeEach(async function () {
      await nftStaking.addCollection(await mockNFT1.getAddress());
      await mockNFT1.connect(user1).approve(await nftStaking.getAddress(), 1);
    });

    it("Should stake an NFT successfully", async function () {
      const user1Address = await user1.getAddress();
      await expect(
        nftStaking.connect(user1).stakeNFT(await mockNFT1.getAddress(), 1)
      )
        .to.emit(nftStaking, "NFTStaked")
        .withArgs(await mockNFT1.getAddress(), 1, user1Address);

      const stakedNFT = await nftStaking.stakedNFTs(
        await mockNFT1.getAddress(),
        1
      );
      expect(stakedNFT.owner).to.equal(user1Address);
    });

    it("Should revert if trying to stake from a non-allowed collection", async function () {
      await expect(
        nftStaking.connect(user2).stakeNFT(await mockNFT2.getAddress(), 1)
      ).to.be.revertedWith("Collection not allowed");
    });

    it("Should revert if trying to stake an already staked NFT", async function () {
      await nftStaking.connect(user1).stakeNFT(await mockNFT1.getAddress(), 1);
      await expect(
        nftStaking.connect(user1).stakeNFT(await mockNFT1.getAddress(), 1)
      ).to.be.revertedWith("NFT already staked");
    });
  });

  describe("unstakeNFT", function () {
    beforeEach(async function () {
      await nftStaking.addCollection(await mockNFT1.getAddress());
      await mockNFT1.connect(user1).approve(await nftStaking.getAddress(), 1);
      await nftStaking.connect(user1).stakeNFT(await mockNFT1.getAddress(), 1);
    });

    it("Should unstake an NFT successfully", async function () {
      const user1Address = await user1.getAddress();
      await expect(
        nftStaking.connect(user1).unstakeNFT(await mockNFT1.getAddress(), 1)
      )
        .to.emit(nftStaking, "NFTUnstaked")
        .withArgs(await mockNFT1.getAddress(), 1, user1Address);

      const stakedNFT = await nftStaking.stakedNFTs(
        await mockNFT1.getAddress(),
        1
      );
      expect(stakedNFT.owner).to.equal(ethers.ZeroAddress);
    });

    it("Should revert if trying to unstake an NFT not owned by the caller", async function () {
      await expect(
        nftStaking.connect(user2).unstakeNFT(await mockNFT1.getAddress(), 1)
      ).to.be.revertedWith("Not the owner of this staked NFT");
    });
  });

  describe("getStakedNFTOwner", function () {
    beforeEach(async function () {
      await nftStaking.addCollection(await mockNFT1.getAddress());
      await mockNFT1.connect(user1).approve(await nftStaking.getAddress(), 1);
      await nftStaking.connect(user1).stakeNFT(await mockNFT1.getAddress(), 1);
    });

    it("Should return the correct owner of a staked NFT", async function () {
      const user1Address = await user1.getAddress();
      const owner = await nftStaking.getStakedNFTOwner(
        await mockNFT1.getAddress(),
        1
      );
      expect(owner).to.equal(user1Address);
    });

    it("Should return zero address for an unstaked NFT", async function () {
      const owner = await nftStaking.getStakedNFTOwner(
        await mockNFT1.getAddress(),
        2
      );
      expect(owner).to.equal(ethers.ZeroAddress);
    });
  });

  describe("getUserStakedNFTs", function () {
    beforeEach(async function () {
      const user1Address = await user1.getAddress();

      await nftStaking.addCollection(await mockNFT1.getAddress());
      await nftStaking.addCollection(await mockNFT2.getAddress());

      // Check ownership before approval
      expect(await mockNFT1.ownerOf(1)).to.equal(user1Address);
      expect(await mockNFT1.ownerOf(2)).to.equal(user1Address);
      expect(await mockNFT2.ownerOf(3)).to.equal(user1Address);

      // Approve NFTs
      await mockNFT1.connect(user1).approve(await nftStaking.getAddress(), 1);
      await mockNFT1.connect(user1).approve(await nftStaking.getAddress(), 2);
      await mockNFT2.connect(user1).approve(await nftStaking.getAddress(), 3);

      // Stake NFTs
      await nftStaking.connect(user1).stakeNFT(await mockNFT1.getAddress(), 1);
      await nftStaking.connect(user1).stakeNFT(await mockNFT1.getAddress(), 2);
      await nftStaking.connect(user1).stakeNFT(await mockNFT2.getAddress(), 3);
    });

    it("Should return all staked NFTs for a user", async function () {
      const user1Address = await user1.getAddress();
      const stakedNFTs = await nftStaking.getUserStakedNFTs(user1Address);
      expect(stakedNFTs.length).to.equal(3);
      expect(stakedNFTs[0].collection).to.equal(await mockNFT1.getAddress());
      expect(stakedNFTs[0].tokenId).to.equal(1);
      expect(stakedNFTs[1].collection).to.equal(await mockNFT1.getAddress());
      expect(stakedNFTs[1].tokenId).to.equal(2);
      expect(stakedNFTs[2].collection).to.equal(await mockNFT2.getAddress());
      expect(stakedNFTs[2].tokenId).to.equal(3);
    });

    it("Should return an empty array for a user with no staked NFTs", async function () {
      const user2Address = await user2.getAddress();
      const stakedNFTs = await nftStaking.getUserStakedNFTs(user2Address);
      expect(stakedNFTs.length).to.equal(0);
    });
  });

  describe("getUserStakedNFTsForCollection", function () {
    beforeEach(async function () {
      const user1Address = await user1.getAddress();

      await nftStaking.addCollection(await mockNFT3.getAddress());
      await nftStaking.addCollection(await mockNFT4.getAddress());

      // Mint NFTs to user1
      await mockNFT3.mint(user1Address, 4);
      await mockNFT4.mint(user1Address, 3);

      // Approve and stake NFTs
      for (let i = 1; i <= 3; i++) {
        await mockNFT3.connect(user1).approve(await nftStaking.getAddress(), i);
        await nftStaking
          .connect(user1)
          .stakeNFT(await mockNFT3.getAddress(), i);
      }
      for (let i = 1; i <= 2; i++) {
        await mockNFT4.connect(user1).approve(await nftStaking.getAddress(), i);
        await nftStaking
          .connect(user1)
          .stakeNFT(await mockNFT4.getAddress(), i);
      }
    });

    it("Should return correct NFTs for a specific collection", async function () {
      const user1Address = await user1.getAddress();
      const mockNFT3Address = await mockNFT3.getAddress();

      const stakedNFTs = await nftStaking.getUserStakedNFTsForCollection(
        user1Address,
        mockNFT3Address
      );

      expect(stakedNFTs.length).to.equal(3);
      for (let i = 0; i < stakedNFTs.length; i++) {
        expect(stakedNFTs[i].collection).to.equal(mockNFT3Address);
        expect(stakedNFTs[i].tokenId).to.equal(i + 1);
        expect(stakedNFTs[i].owner).to.equal(user1Address);
      }
    });

    it("Should return an empty array for a collection with no staked NFTs", async function () {
      const user2Address = await user2.getAddress();
      const mockNFT3Address = await mockNFT3.getAddress();

      const stakedNFTs = await nftStaking.getUserStakedNFTsForCollection(
        user2Address,
        mockNFT3Address
      );

      expect(stakedNFTs.length).to.equal(0);
    });

    it("Should return correct NFTs when user has staked in multiple collections", async function () {
      const user1Address = await user1.getAddress();
      const mockNFT4Address = await mockNFT4.getAddress();

      const stakedNFTs = await nftStaking.getUserStakedNFTsForCollection(
        user1Address,
        mockNFT4Address
      );

      expect(stakedNFTs.length).to.equal(2);
      for (let i = 0; i < stakedNFTs.length; i++) {
        expect(stakedNFTs[i].collection).to.equal(mockNFT4Address);
        expect(stakedNFTs[i].tokenId).to.equal(i + 1);
        expect(stakedNFTs[i].owner).to.equal(user1Address);
      }
    });

    it("Should return an empty array for a non-existent collection", async function () {
      const user1Address = await user1.getAddress();
      const nonExistentCollectionAddress = await user2.getAddress(); // Using user2's address as a non-existent collection

      const stakedNFTs = await nftStaking.getUserStakedNFTsForCollection(
        user1Address,
        nonExistentCollectionAddress
      );

      expect(stakedNFTs.length).to.equal(0);
    });
  });
});
