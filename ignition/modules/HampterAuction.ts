import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("HampterAuctionDeployer", (m) => {
  const hampterAuction = m.contract("HampterAuction");

  //  Start the auction after deployment
  m.call(hampterAuction, "startAuction", [
    m.getParameter("startTime"),
    m.getParameter("endTime"),
    m.getParameter("minBid"),
    m.getParameter("minBidIncrement"),
  ]);

  return { hampterAuction };
});
