// Testnet: npx hardhat run deploy/deploy-hampter-nft.ts --network arbitrumSepolia

import { ethers, run } from "hardhat";
import { HampterNFT } from "../typechain-types/HampterNFT";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Parameters
  const MAX_SUPPLY: number = 8888;
  const TEAM_SUPPLY: number = 1919;
  const AUCTION_SUPPLY: number = 6969;
  const MIN_BID: string = ethers.parseEther("0.069").toString();
  const MAX_BID: string = ethers.parseEther("0.69").toString();
  const MAX_PER_WALLET: number = 3;

  const [deployer] = await ethers.getSigners();

  // Deploy the contract
  const HampterNFTFactory = await ethers.getContractFactory("HampterNFT");
  const hampterNFT: HampterNFT = (await HampterNFTFactory.deploy(
    MAX_PER_WALLET,
    MAX_SUPPLY,
    TEAM_SUPPLY
  )) as HampterNFT;

  console.log("HampterNFT deployed to:", hampterNFT.address);

  // Verify the contract
  console.log("Verifying contract...");
  try {
    await run("verify:verify", {
      address: await hampterNFT.getAddress(),
      constructorArguments: [MAX_PER_WALLET, MAX_SUPPLY, TEAM_SUPPLY],
    });
    console.log("Contract verified successfully");
  } catch (error) {
    console.error("Error verifying contract:", error);
  }

  // Set sale info
  const currentTime: number = Math.floor(Date.now() / 1000);
  const publicSaleStartTime: number = currentTime + 3600; // Start in 1 hour
  const mintlistPrice: string = ethers.parseEther("0.069").toString(); // Set mintlist price to min bid
  const publicPrice: string = ethers.parseEther("0.069").toString(); // Set public price to min bid

  await hampterNFT.setSaleInfo(publicSaleStartTime, mintlistPrice, publicPrice);

  console.log("Sale info set successfully");

  // Set base URI
  const baseURI: string = "https://api.hampternft.com/metadata/";
  await hampterNFT.setBaseURI(baseURI);

  console.log("Base URI set successfully");

  // Mint team tokens
  await hampterNFT.mint(await deployer.getAddress(), TEAM_SUPPLY);

  console.log(`${TEAM_SUPPLY} tokens minted for the team`);

  console.log("Deployment and initial setup completed");
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
