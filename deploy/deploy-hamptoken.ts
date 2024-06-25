import { ethers, run, network } from "hardhat";
import { HampToken } from "../typechain-types"; // Make sure you've generated typechain types

async function main() {
  console.log("Deploying HampToken...");

  // Get the ContractFactory for HampToken
  const HampToken = await ethers.getContractFactory("HampToken");

  // Get the Uniswap Router address
  // Note: You should replace this with the actual Uniswap Router address on your BuildBear testnet
  const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  // Deploy the contract
  const hampToken = await HampToken.deploy(UNISWAP_ROUTER_ADDRESS);

  const HampTokenAddress = await hampToken.getAddress()

  console.log("HampToken deployed to:", await hampToken.getAddress());

  // Optional: Verify the contract on BuildBear
  // Note: This step might require additional setup
  if (network.name !== "hardhat") {
    console.log("Verifying contract on BuildBear...");
    try {
      await run("verify:verify", {
        address: HampTokenAddress,
        constructorArguments: [UNISWAP_ROUTER_ADDRESS],
      });
      console.log("Contract verified successfully");
    } catch (error) {
      console.error("Error verifying contract:", error);
    }
  }
}

// Run the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
