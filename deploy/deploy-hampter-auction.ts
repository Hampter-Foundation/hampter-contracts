import { ethers, run, network } from "hardhat";

async function main() {
  const HampterAuction = await ethers.getContractFactory("HampterAuction");
  console.log("Deploying HampterAuction...");
  const hampterAuction = await HampterAuction.deploy();

  const HampterAuctionAddress = await hampterAuction.getAddress();
  console.log("HampterAuction deployed to:", HampterAuctionAddress);

  // Start the auction
  const startTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const endTime = startTime + 100 * 24 * 60 * 60; // 100 days from now
  const minBid = ethers.parseEther("0.069"); // 0.069 ETH as minimum bid
  const bidDenomination = ethers.parseEther("0.1"); // 0.1 ETH as bid denomination

  console.log("Starting auction...");
  const tx = await hampterAuction.startAuction(
    startTime,
    endTime,
    minBid,
    bidDenomination
  );
  await tx.wait();
  console.log("Auction started successfully");
  console.log("Start time:", new Date(startTime * 1000).toISOString());
  console.log("End time:", new Date(endTime * 1000).toISOString());
  console.log("Minimum bid:", ethers.formatEther(minBid), "ETH");
  console.log("Bid denomination: 0.1 ETH (hardcoded in contract)");

  // Verify the contract
  if (network.name !== "hardhat") {
    console.log("Verifying contract on", network.name);
    try {
      await run("verify:verify", {
        address: HampterAuctionAddress,
        constructorArguments: [],
      });
      console.log("Contract verified successfully");
    } catch (error) {
      console.error("Error verifying contract:", error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
