import { expect } from "chai";
import { ethers } from "hardhat";
import { HampterNFT } from "../typechain-types/HampterNFT";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("HampterNFT", function () {
  let HampterNFT: HampterNFT;
  let hampterNFT: HampterNFT;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  beforeEach(async function () {
    const HampterNFTFactory = await ethers.getContractFactory("HampterNFT");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    hampterNFT = (await HampterNFTFactory.deploy(
      5, // maxBatchSize
      100000, // collectionSize
      500 // amountForDevs
    )) as HampterNFT;
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await hampterNFT.owner()).to.equal(owner.address);
    });

    it("Should set the correct collection size and max batch size", async function () {
      expect(await hampterNFT.collectionSize()).to.equal(100000);
      expect(await hampterNFT.maxPerAddressDuringMint()).to.equal(5);
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint for devs", async function () {
      await hampterNFT.devMint(500);
      expect(await hampterNFT.totalSupply()).to.equal(500);
    });

    it("Should fail if non-owner tries to mint for devs", async function () {
      await expect(hampterNFT.connect(addr1).devMint(500)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should allow public sale minting", async function () {
      await hampterNFT.setPublicSaleKey(1234);
      await hampterNFT.endAuctionAndSetupNonAuctionSaleInfo(
        ethers.parseEther("0.08"),
        ethers.parseEther("0.1"),
        Math.floor(Date.now() / 1000) - 1000
      );

      await hampterNFT.publicSaleMint(2, 1234, {
        value: ethers.parseEther("0.2"),
      });
      expect(await hampterNFT.totalSupply()).to.equal(2);
    });
  });

  describe("Public Sale Minting", function () {
    beforeEach(async function () {
      await hampterNFT.SetSaleInfo(
        ethers.parseEther("0.1"),
        ethers.parseEther("0.2"),
        Math.floor(Date.now() / 1000) - 1000
      );
    });

    it("Should allow public sale minting", async function () {
      await hampterNFT
        .connect(addr1)
        .publicSaleMint(1, { value: ethers.parseEther("0.2") });
      expect(await hampterNFT.balanceOf(addr1.address)).to.equal(1);
    });

    it("Should fail if not enough ETH sent", async function () {
      await expect(
        hampterNFT
          .connect(addr1)
          .publicSaleMint(1, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Need to send more ETH.");
    });

    it("Should fail if public sale has not started", async function () {
      await hampterNFT.SetSaleInfo(
        ethers.parseEther("0.1"),
        ethers.parseEther("0.2"),
        Math.floor(Date.now() / 1000) + 1000
      );
      await expect(
        hampterNFT
          .connect(addr1)
          .publicSaleMint(1, { value: ethers.utils.parseEther("0.2") })
      ).to.be.revertedWith("public sale has not begun yet");
    });
  });

  describe("Allowlist", function () {
    it("Should allow allowlist minting", async function () {
      await hampterNFT.seedAllowlist([addr1.address], [1]);
      await hampterNFT.SetSaleInfo(
        Math.floor(Date.now() / 1000) - 1000,
        ethers.parseEther("0.08"),
        ethers.parseEther("0.1")
      );

      await hampterNFT
        .connect(addr1)
        .allowlistMint({ value: ethers.parseEther("0.08") });
      expect(await hampterNFT.totalSupply()).to.equal(1);
      expect(await hampterNFT.balanceOf(addr1.address)).to.equal(1);
    });

    it("Should fail to mint from allowlist if not on the list", async function () {
      await hampterNFT.seedAllowlist([addr1.address], [1]);
      await hampterNFT.SetSaleInfo(
        Math.floor(Date.now() / 1000) - 1000,
        ethers.parseEther("0.08"),
        ethers.parseEther("0.1")
      );

      await expect(
        hampterNFT
          .connect(addr2)
          .allowlistMint({ value: ethers.parseEther("0.08") })
      ).to.be.revertedWith("not eligible for allowlist mint");
    });
  });
});
