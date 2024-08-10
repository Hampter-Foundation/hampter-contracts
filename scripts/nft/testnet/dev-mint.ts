// npx hardhat run scripts/nft/dev-mint.ts --network arbitrumSepolia

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { HampterNFT } from "../../../typechain-types";

dotenv.config();

async function main() {
  // The address of your deployed NFT contract
  const NFT_CONTRACT_ADDRESS = "0xEb123fF7B08BB91983A78eAC350af0F244569c8a";

  // Get the NFT contract
  const NFTContract = await ethers.getContractFactory("HampterNFT");
  const nftContract = NFTContract.attach(NFT_CONTRACT_ADDRESS) as HampterNFT;

  console.log("minting...");

  // Call the devMint function
  const tx = await nftContract.devMint("3");

  // Wait for the transaction to be mined
  await tx.wait();

  console.log(`Dev Minted successfully`);

  // Verify balance of `0x1cafAad21E319DE9A35054b9F6048743786d76A5`
  const balance = await nftContract.balanceOf(
    "0x1cafAad21E319DE9A35054b9F6048743786d76A5"
  );
  console.log(`Verified balance: ${balance}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
