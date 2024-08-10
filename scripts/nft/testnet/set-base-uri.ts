// Testnet: npx hardhat run scripts/nft/set-base-uri.ts
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { HampterNFT } from "../../typechain-types";

dotenv.config();

async function main() {
  // The address of your deployed NFT contract
  const NFT_CONTRACT_ADDRESS = "0xEb123fF7B08BB91983A78eAC350af0F244569c8a";

  // The new base URI you want to set
  const NEW_BASE_URI = "ipfs://QmPaTdqXizZ8WeNKb64dENpndSLfY7QpuWLqE9ZJAyWctU";

  // Get the NFT contract
  const NFTContract = await ethers.getContractFactory("NFTStaking");
  const nftContract = NFTContract.attach(NFT_CONTRACT_ADDRESS) as HampterNFT;

  console.log("Setting new Base URI...");

  // Call the setBaseURI function
  const tx = await nftContract.setBaseURI(NEW_BASE_URI);

  // Wait for the transaction to be mined
  await tx.wait();

  console.log(`Base URI set successfully to: ${NEW_BASE_URI}`);

  // Optional: Verify the new Base URI
  const newBaseURI = await nftContract.tokenURI(1);
  console.log(`Verified new Base URI: ${newBaseURI}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
