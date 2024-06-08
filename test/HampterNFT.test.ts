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

    it("Should initialize collectionSize, maxBatchSize, and amountForDevs correctly", async function () {
      expect(await hampterNFT.collectionSize()).to.equal(100000);
      expect(await hampterNFT.maxPerAddressDuringMint()).to.equal(5);
      expect(await hampterNFT.amountForDevs()).to.equal(500);
    });
  });

  describe("Dev Minting", function () {
    it("Should allow owner to mint for devs", async function () {
      await hampterNFT.devMint(10);
      expect(await hampterNFT.balanceOf(owner.address)).to.equal(10);
    });

    it("Should fail if trying to mint more than allowed for devs", async function () {
      await expect(hampterNFT.devMint(11)).to.be.revertedWith(
        "can only mint a multiple of the maxBatchSize"
      );
    });

    it("Should fail if quantity is not a multiple of maxBatchSize", async function () {
      await expect(hampterNFT.devMint(7)).to.be.revertedWith(
        "can only mint a multiple of the maxBatchSize"
      );
    });

    it("Should fail if non-owner tries to mint for devs", async function () {
      await expect(hampterNFT.connect(addr1).devMint(500))
        .to.be.revertedWithCustomError(hampterNFT, "OwnableUnauthorizedAccount")
        .withArgs(addr1.address);
    });
  });

  describe("Allowlist Minting", function () {
    beforeEach(async function () {
      await hampterNFT.seedAllowlist([addr1.address], [1]);
      await hampterNFT.setSaleInfo(
        Math.floor(Date.now() / 1000) - 1000,
        ethers.parseEther("0.1"),
        ethers.parseEther("0.2")
      );
    });

    it("Should allow allowlist minting", async function () {
      await hampterNFT
        .connect(addr1)
        .allowlistMint({ value: ethers.parseEther("0.1") });
      expect(await hampterNFT.balanceOf(addr1.address)).to.equal(1);
    });

    it("Should fail if not enough ETH sent", async function () {
      await expect(
        hampterNFT
          .connect(addr1)
          .allowlistMint({ value: ethers.parseEther("0.05") })
      ).to.be.revertedWith("Need to send more ETH.");
    });

    it("Should fail if address is not on allowlist", async function () {
      await expect(
        hampterNFT
          .connect(addr2)
          .allowlistMint({ value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("not eligible for allowlist mint");
    });
  });

  describe("Public Sale Minting", function () {
    beforeEach(async function () {
      await hampterNFT.setSaleInfo(
        Math.floor(Date.now() / 1000) - 1000,
        ethers.parseEther("0.1"),
        ethers.parseEther("0.2")
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
      await hampterNFT.setSaleInfo(
        Math.floor(Date.now() / 1000) + 10000,
        ethers.parseEther("0.1"),
        ethers.parseEther("0.2")
      );
      await expect(
        hampterNFT
          .connect(addr1)
          .publicSaleMint(1, { value: ethers.parseEther("0.2") })
      ).to.be.revertedWith("public sale has not begun yet");
    });

    // it("Should fail if minting exceeds batch size", async function () {
    //   await hampterNFT.setSaleInfo(
    //     Math.floor(Date.now() / 1000) - 1000,
    //     ethers.parseEther("0.1"),
    //     ethers.parseEther("0.2")
    //   );
    //   await hampterNFT.publicSaleMint(100000, {
    //     value: ethers.parseEther("20"),
    //   });
    //   await expect(
    //     hampterNFT
    //       .connect(addr1)
    //       .publicSaleMint(1, { value: ethers.parseEther("0.2") })
    //   ).to.be.revertedWith("cannot mint more than maxBatchSize");
    // });
  });

  describe("Allowlist", function () {
    it("Should allow allowlist minting", async function () {
      await hampterNFT.seedAllowlist([addr1.address], [1]);
      await hampterNFT.setSaleInfo(
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
      await hampterNFT.setSaleInfo(
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

  describe("Ownership", function () {
    it("Should allow only the owner to withdraw funds", async function () {
      await hampterNFT.setSaleInfo(
        Math.floor(Date.now() / 1000) - 1000,
        ethers.parseEther("0.1"),
        ethers.parseEther("0.2")
      );

      await hampterNFT
        .connect(addr1)
        .publicSaleMint(1, { value: ethers.parseEther("0.2") });

      const initialBalance = await ethers.provider.getBalance(owner.address);
      await expect(hampterNFT.connect(addr1).withdrawMoney())
        .to.be.revertedWithCustomError(hampterNFT, "OwnableUnauthorizedAccount")
        .withArgs(addr1.address);

      await hampterNFT.withdrawMoney();
      const finalBalance = await ethers.provider.getBalance(owner.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });
  });
});
