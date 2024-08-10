// Testnet: npx hardhat run scripts/nft-staking/add-collection.ts

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { NFTStaking } from "../../../typechain-types";

dotenv.config();

async function main() {
  // The address of your deployed NFTStaking contract
  const NFT_STAKING_ADDRESS = "0xd487B46940DDC01DE5Cc6e08FAa4f7f9cDe392f5";

  // The address of the collection you want to add
  const COLLECTION_ADDRESS = "0xEb123fF7B08BB91983A78eAC350af0F244569c8a";

  // Get the NFTStaking contract
  const NFTStaking = await ethers.getContractFactory("NFTStaking");
  const nftStaking = NFTStaking.attach(NFT_STAKING_ADDRESS) as NFTStaking;

  console.log("Adding collection to NFTStaking contract...");

  // Call the addCollection function
  const tx = await nftStaking.addCollection(COLLECTION_ADDRESS);

  // Wait for the transaction to be mined
  await tx.wait();

  console.log(`Collection ${COLLECTION_ADDRESS} added successfully!`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
