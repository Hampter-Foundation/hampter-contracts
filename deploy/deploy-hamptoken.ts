import { ethers, run, network } from "hardhat";
import { HampToken } from "../typechain-types";

async function main() {
  console.log("Deploying HampToken...");

  const [deployer] = await ethers.getSigners();

  // Get the ContractFactory for HampToken
  const HampToken = await ethers.getContractFactory("HampToken");

  // Get the Uniswap Router address
  // Note: You should replace this with the actual Uniswap Router address on your BuildBear testnet
  const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  // Deploy the contract
  const hampToken = await HampToken.deploy(UNISWAP_ROUTER_ADDRESS);

  const HampTokenAddress = await hampToken.getAddress();

  console.log("HampToken deployed to:", HampTokenAddress);

  // Optional: Verify the contract on BuildBear
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

  // Enable trading
  console.log("Enabling trading...");
  const enableTradingTx = await hampToken.enableTrading();
  await enableTradingTx.wait();
  console.log("Trading enabled successfully");

  // Add liquidity to the Uniswap pool
  console.log("Adding liquidity to Uniswap...");

  // The amount of HAMP tokens you want to add to the liquidity pool
  const tokenAmount = ethers.parseEther("1000000"); // 1 million HAMP tokens

  // The amount of ETH you want to add to the liquidity pool
  const ethAmount = ethers.parseEther("10"); // 10 ETH

  // Approve the router to spend your tokens
  const approveTx = await hampToken.approve(
    UNISWAP_ROUTER_ADDRESS,
    tokenAmount
  );
  await approveTx.wait();
  console.log("Approved Uniswap Router to spend HAMP tokens");

  // Get the Uniswap Router contract
  const uniswapRouter = await ethers.getContractAt(
    "IUniswapV2Router02",
    UNISWAP_ROUTER_ADDRESS
  );

  // Add liquidity
  const addLiquidityTx = await uniswapRouter.addLiquidityETH(
    HampTokenAddress,
    tokenAmount,
    0, // slippage is unavoidable
    0, // slippage is unavoidable
    deployer.address,
    Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutes from now
    { value: ethAmount }
  );

  const receipt = await addLiquidityTx.wait();
  console.log(
    "Liquidity added successfully. Transaction hash:",
    await receipt?.getTransaction()
  );

  // Final checks
  const tradingEnabled = await hampToken.tradingActive();
  console.log("Trading enabled:", tradingEnabled);

  const contractBalance = await hampToken.balanceOf(HampTokenAddress);
  console.log("Contract HAMP balance:", ethers.formatEther(contractBalance));

  const deployerBalance = await hampToken.balanceOf(deployer.address);
  console.log("Deployer HAMP balance:", ethers.formatEther(deployerBalance));

  const pairAddress = await hampToken.uniswapV2Pair();
  const pairBalance = await hampToken.balanceOf(pairAddress);
  console.log("Uniswap Pair HAMP balance:", ethers.formatEther(pairBalance));
}

// Run the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
