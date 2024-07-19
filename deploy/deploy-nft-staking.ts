// Testnet: npx hardhat run deploy/deploy-nft-staking.ts --network arbitrumSepolia

import { ethers, run } from "hardhat";
import { NFTStaking } from "../typechain-types/NFTStaking";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying NFTStaking contract with the account:",
    deployer.address
  );

  // Deploy the contract
  const NFTStakingFactory = await ethers.getContractFactory("NFTStaking");
  const nftStaking: NFTStaking =
    (await NFTStakingFactory.deploy()) as NFTStaking;

  await nftStaking.waitForDeployment();

  console.log("NFTStaking deployed to:", await nftStaking.getAddress());

  // Verify the contract
  console.log("Verifying contract...");
  try {
    await run("verify:verify", {
      address: await nftStaking.getAddress(),
      constructorArguments: [],
    });
    console.log("Contract verified successfully");
  } catch (error) {
    console.error("Error verifying contract:", error);
  }

  // Add initial allowed collections
  const initialCollections = [
    "0x1234567890123456789012345678901234567890",
    "0x0987654321098765432109876543210987654321",
  ];

  console.log("Adding initial allowed collections...");
  for (const collection of initialCollections) {
    await nftStaking.addCollection(collection);
    console.log(`Added collection: ${collection}`);
  }

  console.log("Deployment and initial setup completed");
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
