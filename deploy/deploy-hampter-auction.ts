import { ethers } from "hardhat";

async function main() {
  const HampterAuction = await ethers.getContractFactory("HampterAuction");
  console.log("Deploying HampterAuction...");
  const hampterAuction =
    await HampterAuction.deploy(/* constructor arguments if any */);

  const HampterAuctionAddress = await hampterAuction.getAddress();
  console.log("HampterAuction deployed to:", HampterAuctionAddress);

  // Start the auction
  const startTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const endTime = startTime + 100 * 24 * 60 * 60; // 100 days from now
  const minBid = ethers.parseEther("0.1"); // 0.1 ETH as minimum bid
  const minBidIncrement = ethers.parseEther("0.01"); // 0.01 ETH as minimum bid increment

  console.log("Starting auction...");
  const tx = await hampterAuction.startAuction(
    startTime,
    endTime,
    minBid,
    minBidIncrement
  );
  await tx.wait();
  console.log("Auction started successfully");
  console.log("Start time:", new Date(startTime * 1000).toISOString());
  console.log("End time:", new Date(endTime * 1000).toISOString());
  console.log("Minimum bid:", ethers.formatEther(minBid), "ETH");
  console.log(
    "Minimum bid increment:",
    ethers.formatEther(minBidIncrement),
    "ETH"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
