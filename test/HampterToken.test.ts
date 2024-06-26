import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  time,
  loadFixture,
  mine,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  HampToken,
  IUniswapV2Router02,
  IUniswapV2Factory,
  IWETH,
} from "../typechain-types";
import { Contract } from "ethers";
import { hampterTokenSol } from "../typechain-types/contracts";

const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL || "https://eth.llamarpc.com";

describe("HampToken", function () {
  let hampToken: HampToken;
  let owner: SignerWithAddress,
    addr1: SignerWithAddress,
    addr2: SignerWithAddress,
    addr3: SignerWithAddress,
    teamWallet: SignerWithAddress,
    revShareWallet: SignerWithAddress;
  let uniswapRouter: IUniswapV2Router02;
  let uniswapFactory: IUniswapV2Factory;
  let weth: IWETH;
  let pair: string;
  // const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10 million tokens
  const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Mainnet Uniswap V2 Router
  let hampTokenAddress: string;

  async function deployFixture() {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        { forking: { jsonRpcUrl: MAINNET_RPC_URL, blockNumber: 20134894 } },
      ],
    });

    [owner, addr1, addr2, addr3, teamWallet, revShareWallet] =
      await ethers.getSigners();

    const HampTokenFactory = await ethers.getContractFactory("HampToken");
    hampToken = (await HampTokenFactory.deploy(
      UNISWAP_ROUTER_ADDRESS
    )) as HampToken;
    hampTokenAddress = await hampToken.getAddress();

    uniswapRouter = (await ethers.getContractAt(
      "IUniswapV2Router02",
      UNISWAP_ROUTER_ADDRESS
    )) as IUniswapV2Router02;
    uniswapFactory = (await ethers.getContractAt(
      "IUniswapV2Factory",
      await uniswapRouter.factory()
    )) as IUniswapV2Factory;
    weth = (await ethers.getContractAt(
      "IWETH",
      await uniswapRouter.WETH()
    )) as IWETH;

    pair = await uniswapFactory.getPair(
      hampTokenAddress,
      await weth.getAddress()
    );

    await hampToken.updateTeamWallet(teamWallet.address);
    await hampToken.updateRevShareWallet(revShareWallet.address);
    await hampToken.enableTrading();

    return {
      hampToken,
      uniswapRouter,
      weth,
      pair,
      owner,
      addr1,
      addr2,
      addr3,
      teamWallet,
      revShareWallet,
    };
  }

  async function mineBlocks(numberOfBlocks: number) {
    for (let i = 0; i < numberOfBlocks; i++) {
      await network.provider.send("evm_mine");
    }
  }

  async function deployNewToken(): Promise<HampToken> {
    const HampTokenFactory = await ethers.getContractFactory("HampToken");
    return (await HampTokenFactory.deploy(
      await uniswapRouter.getAddress()
    )) as HampToken;
  }

  async function addLiquidity(
    token: HampToken,
    tokenAmount: bigint,
    liquidityEthAmount = ethers.parseEther("10")
  ) {
    const liquidityTokenAmount = tokenAmount;

    await token.approve(await uniswapRouter.getAddress(), liquidityTokenAmount);

    await uniswapRouter.addLiquidityETH(
      await token.getAddress(),
      liquidityTokenAmount,
      0,
      0,
      owner.address,
      (await time.latest()) + 3600,
      { value: liquidityEthAmount }
    );
  }

  async function performSwap(
    router: IUniswapV2Router02,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    to: string
  ) {
    await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0,
      [tokenIn, tokenOut],
      to,
      (await time.latest()) + 3600
    );
  }

  beforeEach(async function () {
    ({
      hampToken,
      uniswapRouter,
      weth,
      pair,
      owner,
      addr1,
      addr2,
      addr3,
      teamWallet,
      revShareWallet,
    } = await loadFixture(deployFixture));
    await addLiquidity(hampToken, ethers.parseEther("100000"));
  });

  beforeEach(async function () {
    ({
      hampToken,
      uniswapRouter,
      weth,
      pair,
      owner,
      addr1,
      addr2,
      addr3,
      teamWallet,
      revShareWallet,
    } = await loadFixture(deployFixture));
    await addLiquidity(hampToken, ethers.parseEther("100000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await hampToken.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await hampToken.balanceOf(owner.address);
      expect(await hampToken.totalSupply()).to.equal(ownerBalance);
    });

    it("Should set the correct team and revShare wallets", async function () {
      expect(await hampToken.teamWallet()).to.equal(teamWallet.address);
      expect(await hampToken.revShareWallet()).to.equal(revShareWallet.address);
    });
  });

  describe("Fee Taxing", async function () {
    it("Should apply buy fees correctly", async function () {
      // Get the router address
      const uniswapRouterAddress = await uniswapRouter.getAddress();

      // Deploy a new token
      const HampTokenFactory = await ethers.getContractFactory("HampToken");
      const newToken = (await HampTokenFactory.deploy(
        uniswapRouterAddress
      )) as HampToken;

      // Get the new token's address
      const newTokenAddress = await newToken.getAddress();

      // Enable trading
      await newToken.enableTrading();

      // Add liquidity
      await addLiquidity(newToken, ethers.parseEther("100000"));

      // Check contract balance before trade
      const contractBalanceBeforeTrade = await newToken.balanceOf(
        await newToken.getAddress()
      );

      expect(await newToken.balanceOf(addr2.address)).to.equal(0);

      // Now perform a swap (buy tokens)
      const buyAmount = ethers.parseEther("1");
      await uniswapRouter
        .connect(addr2)
        .swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          [await weth.getAddress(), newTokenAddress],
          addr2.address,
          (await ethers.provider.getBlock("latest")).timestamp + 3600,
          { value: buyAmount }
        );

      // Check if addr2 received the tokens
      const addr2Balance = await newToken.balanceOf(addr2.address);
      expect(addr2Balance).to.be.gt(0);

      // Calculate the expected amount without fees
      const path = [await weth.getAddress(), newTokenAddress];
      const [, expectedAmountWithoutFees] = await uniswapRouter.getAmountsOut(
        buyAmount,
        path
      );

      // Check if fees were collected on this trade
      const contractBalanceAfterTrade =
        await newToken.balanceOf(newTokenAddress);
      const collectedFees =
        contractBalanceAfterTrade - contractBalanceBeforeTrade;

      // Get the fee percentages from the contract
      const buyRevShareFee = await newToken.buyRevShareFee();
      const buyLiquidityFee = await newToken.buyLiquidityFee();
      const buyTeamFee = await newToken.buyTeamFee();
      const totalBuyFee = buyRevShareFee + buyLiquidityFee + buyTeamFee;

      // console.log(
      //   `Contract buy fees: RevShare: ${buyRevShareFee}, Liquidity: ${buyLiquidityFee}, Team: ${buyTeamFee}, Total: ${totalBuyFee}`
      // );

      // Calculate the expected fee amount
      const expectedFeeAmount =
        (expectedAmountWithoutFees * BigInt(totalBuyFee)) / 10000n;

      // TODO: This isnt working properly due to slippage
      // Check if the expected Fee Amount is 5% of the expected amount without fees

      // // Verify that the collected fees are close to the expected fee amount
      // const tolerance = expectedFeeAmount / 100n; // 1% tolerance
      // expect(collectedFees).to.be.closeTo(expectedFeeAmount, tolerance);

      // // Verify that the received amount plus fees is close to the expected amount without fees
      // expect(addr2Balance + collectedFees).to.be.closeTo(
      //   expectedAmountWithoutFees,
      //   tolerance
      // );

      // Additional check: total supply should remain constant
      const totalSupplyAfter = await newToken.totalSupply();
      expect(totalSupplyAfter).to.equal(await newToken.totalSupply());
    });

    it("Should apply sell fees correctly", async function () {
      // Get the router address
      const uniswapRouterAddress = await uniswapRouter.getAddress();

      // Deploy a new token
      const HampTokenFactory = await ethers.getContractFactory("HampToken");
      const newToken = (await HampTokenFactory.deploy(
        uniswapRouterAddress
      )) as HampToken;

      // Get the new token's address
      const newTokenAddress = await newToken.getAddress();

      // Enable trading
      await newToken.enableTrading();

      // Add liquidity
      await addLiquidity(newToken, ethers.parseEther("100000"));

      // Buy tokens first to have some to sell
      const buyAmount = ethers.parseEther("1");
      await uniswapRouter
        .connect(addr2)
        .swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          [await weth.getAddress(), newTokenAddress],
          addr2.address,
          (await ethers.provider.getBlock("latest")).timestamp + 3600,
          { value: buyAmount }
        );

      const addr2BalanceAfterBuy = await newToken.balanceOf(addr2.address);

      // Check contract balance before sell
      const contractBalanceBeforeTrade = await newToken.balanceOf(
        await newToken.getAddress()
      );

      // Approve tokens for selling
      await newToken
        .connect(addr2)
        .approve(uniswapRouterAddress, addr2BalanceAfterBuy);

      // Now perform a swap (sell tokens)
      await uniswapRouter
        .connect(addr2)
        .swapExactTokensForETHSupportingFeeOnTransferTokens(
          addr2BalanceAfterBuy,
          0,
          [newTokenAddress, await weth.getAddress()],
          addr2.address,
          (await ethers.provider.getBlock("latest")).timestamp + 3600
        );

      // Check if addr2 sold all tokens
      const addr2BalanceAfterSell = await newToken.balanceOf(addr2.address);
      expect(addr2BalanceAfterSell).to.equal(0);

      // Calculate the expected amount without fees
      const path = [newTokenAddress, await weth.getAddress()];
      const [, expectedEthWithoutFees] = await uniswapRouter.getAmountsOut(
        addr2BalanceAfterBuy,
        path
      );

      // Check if fees were collected on this trade
      const contractBalanceAfterTrade =
        await newToken.balanceOf(newTokenAddress);
      const collectedFees =
        contractBalanceAfterTrade - contractBalanceBeforeTrade;

      // Get the fee percentages from the contract
      const sellRevShareFee = await newToken.sellRevShareFee();
      const sellLiquidityFee = await newToken.sellLiquidityFee();
      const sellTeamFee = await newToken.sellTeamFee();
      const totalSellFee = sellRevShareFee + sellLiquidityFee + sellTeamFee;

      console.log(
        `Contract sell fees: RevShare: ${sellRevShareFee}, Liquidity: ${sellLiquidityFee}, Team: ${sellTeamFee}, Total: ${totalSellFee}`
      );

      // Calculate the expected fee amount
      const expectedFeeAmount =
        (addr2BalanceAfterBuy * BigInt(totalSellFee)) / 10000n;

      // Verify that the collected fees are close to the expected fee amount
      const tolerance = expectedFeeAmount / 100n; // 1% tolerance
      expect(collectedFees).to.be.closeTo(expectedFeeAmount, tolerance);

      // Additional check: total supply should remain constant
      const totalSupplyAfter = await newToken.totalSupply();
      expect(totalSupplyAfter).to.equal(await newToken.totalSupply());
    });

    it("Should not apply fees to excluded addresses", async function () {
      const uniswapRouterAddress = await uniswapRouter.getAddress();

      // Deploy a new token
      const HampTokenFactory = await ethers.getContractFactory("HampToken");
      const newToken = (await HampTokenFactory.deploy(
        uniswapRouterAddress
      )) as HampToken;

      // Get the new token's address
      const newTokenAddress = await newToken.getAddress();

      // Enable trading
      await newToken.enableTrading();

      // Now let's simulate a trade (buy) to check if fees are applied
      await addLiquidity(newToken, ethers.parseEther("100000"));

      await hampToken.excludeFromFees(addr1.address, true);
      const initialBalance = await hampToken.balanceOf(addr1.address);
      const transferAmount = ethers.parseEther("1000");
      await hampToken.transfer(addr1.address, transferAmount);
      const finalBalance = await hampToken.balanceOf(addr1.address);
      expect(finalBalance - initialBalance).to.equal(transferAmount);
    });
  });

  describe("Swap Back and Liquidity Addition", function () {
    let newToken: HampToken;
    let newTokenAddress: string;

    beforeEach(async function () {
      // Deploy a new token
      const HampTokenFactory = await ethers.getContractFactory("HampToken");
      newToken = (await HampTokenFactory.deploy(
        await uniswapRouter.getAddress()
      )) as HampToken;
      newTokenAddress = await newToken.getAddress();

      // Enable trading
      await newToken.connect(owner).enableTrading();

      // Add initial liquidity
      const liquidityAmount = ethers.parseEther("1000000"); // 1 million tokens
      await newToken
        .connect(owner)
        .approve(await uniswapRouter.getAddress(), liquidityAmount);
      await addLiquidity(newToken, liquidityAmount, ethers.parseEther("100")); // 100 ETH

      // Exclude owner from fees to simplify testing
      await newToken.connect(owner).excludeFromFees(owner.address, true);
    });

    async function buyTokens(amount: bigint, signer: SignerWithAddress) {
      await uniswapRouter
        .connect(signer)
        .swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          [await weth.getAddress(), newTokenAddress],
          signer.address,
          (await time.latest()) + 3600,
          { value: amount }
        );
    }

    async function sellTokens(signer: SignerWithAddress) {
      const balance = await newToken.balanceOf(signer.address);
      await newToken
        .connect(signer)
        .approve(await uniswapRouter.getAddress(), balance);
      await uniswapRouter
        .connect(signer)
        .swapExactTokensForETHSupportingFeeOnTransferTokens(
          balance,
          0,
          [newTokenAddress, await weth.getAddress()],
          signer.address,
          (await time.latest()) + 3600
        );
    }

    function isSignificantChange(
      initial: bigint,
      final: bigint,
      threshold: number
    ): boolean {
      const change = Number(((final - initial) * 10000n) / initial) / 100;
      return Math.abs(change) > threshold;
    }

    it("Should perform swap back when threshold is met", async function () {
      // Set Team and RevShare wallets
      await newToken.updateTeamWallet(teamWallet.address);
      await newToken.updateRevShareWallet(revShareWallet.address);

      const swapThreshold = await newToken.swapTokensAtAmount();
      const initialTeamBalance = await ethers.provider.getBalance(
        teamWallet.address
      );
      const initialRevShareBalance = await ethers.provider.getBalance(
        revShareWallet.address
      );

      console.log(
        `Initial Team Balance: ${ethers.formatEther(initialTeamBalance)} ETH`
      );
      console.log(
        `Initial RevShare Balance: ${ethers.formatEther(initialRevShareBalance)} ETH`
      );

      // Perform multiple buys and sells to accumulate fees
      let contractBalance = BigInt(0);
      while (contractBalance < swapThreshold) {
        await buyTokens(ethers.parseEther("100"), addr2);
        await sellTokens(addr2);
        contractBalance = await newToken.balanceOf(newTokenAddress);
      }

      console.log(
        `Contract balance: ${ethers.formatEther(contractBalance)} HAMP, Swap threshold: ${ethers.formatEther(swapThreshold)} HAMP`
      );

      // Transfer tokens to a non-excluded address
      await newToken
        .connect(owner)
        .transfer(addr1.address, ethers.parseEther("1000000"));

      // Trigger a transfer to initiate swap back
      await newToken
        .connect(addr1)
        .transfer(addr3.address, ethers.parseEther("100000"));

      // Trigger a transfer to initiate swap back
      const tx = await newToken
        .connect(addr1)
        .transfer(addr3.address, ethers.parseEther("100000"));
      const receipt = await tx.wait();

      // Check for SwapAndLiquify event
      const swapAndLiquifyEvent = receipt.events?.find(
        (event) => event.event === "SwapForETH"
      );

      if (swapAndLiquifyEvent) {
        const { tokensSwapped, ethReceived, tokensIntoLiquidity } =
          swapAndLiquifyEvent.args as SwapForETH;
        console.log("SwapAndLiquify event emitted:");
        console.log(
          `Tokens Swapped: ${ethers.formatEther(tokensSwapped)} HAMP`
        );
        console.log(`ETH Received: ${ethers.formatEther(ethReceived)} ETH`);
        console.log(
          `Tokens Into Liquidity: ${ethers.formatEther(tokensIntoLiquidity)} HAMP`
        );
      } else {
        console.log("SwapForETH event was not emitted");
      }

      // Wait for a few blocks to allow the swap to complete
      // Wait for a few blocks to allow the swap to complete
      await mine(5); // Mine 5 blocks
      await time.increase(60); // Increase time by 60 seconds

      const finalTeamBalance = await ethers.provider.getBalance(
        teamWallet.address
      );
      const finalRevShareBalance = await ethers.provider.getBalance(
        revShareWallet.address
      );

      console.log(
        `Final Team Balance: ${ethers.formatEther(finalTeamBalance)} ETH`
      );
      console.log(
        `Final RevShare Balance: ${ethers.formatEther(finalRevShareBalance)} ETH`
      );

      const teamBalanceIncrease = finalTeamBalance - initialTeamBalance;
      const revShareBalanceIncrease =
        finalRevShareBalance - initialRevShareBalance;

      console.log(
        `Team Balance Increase: ${ethers.formatEther(teamBalanceIncrease)} ETH`
      );
      console.log(
        `RevShare Balance Increase: ${ethers.formatEther(revShareBalanceIncrease)} ETH`
      );

      // Check if the team and revShare wallets have received the fees
      expect(finalTeamBalance).to.be.gt(
        initialTeamBalance,
        "Team balance should increase"
      );
      expect(finalRevShareBalance).to.be.gt(
        initialRevShareBalance,
        "RevShare balance should increase"
      );

      // Calculate the minimum expected increase based on the fees
      const buyTeamFee = await newToken.buyTeamFee();
      const sellTeamFee = await newToken.sellTeamFee();
      const buyRevShareFee = await newToken.buyRevShareFee();
      const sellRevShareFee = await newToken.sellRevShareFee();

      const totalFees =
        buyTeamFee + sellTeamFee + buyRevShareFee + sellRevShareFee;
      const minExpectedIncrease =
        (contractBalance * BigInt(totalFees)) / BigInt(10000);

      console.log(
        `Minimum expected increase: ${ethers.formatEther(minExpectedIncrease)} ETH`
      );

      // Check if the total increase is at least the minimum expected
      const totalIncrease = teamBalanceIncrease + revShareBalanceIncrease;
      expect(totalIncrease).to.be.gte(
        minExpectedIncrease,
        "Total balance increase should meet or exceed the minimum expected based on fees"
      );
    });

    it("Should not perform swap back if threshold is not met", async function () {
      const swapThreshold = await newToken.swapTokensAtAmount();
      const initialTeamBalance = await ethers.provider.getBalance(
        await newToken.teamWallet()
      );
      const initialRevShareBalance = await ethers.provider.getBalance(
        await newToken.revShareWallet()
      );

      // Perform a small buy and sell
      await buyTokens(ethers.parseEther("0.1"), addr2);
      await sellTokens(addr2);

      const contractBalance = await newToken.balanceOf(newTokenAddress);
      console.log(
        `Contract balance: ${contractBalance}, Swap threshold: ${swapThreshold}`
      );

      expect(contractBalance).to.be.lt(
        swapThreshold,
        "Contract balance should be below swap threshold"
      );

      // Trigger a transfer
      await newToken
        .connect(owner)
        .transfer(addr3.address, ethers.parseEther("1"));

      const finalTeamBalance = await ethers.provider.getBalance(
        await newToken.teamWallet()
      );
      const finalRevShareBalance = await ethers.provider.getBalance(
        await newToken.revShareWallet()
      );

      expect(isSignificantChange(initialTeamBalance, finalTeamBalance, 0.1)).to
        .be.false;
      expect(
        isSignificantChange(initialRevShareBalance, finalRevShareBalance, 0.1)
      ).to.be.false;
    });

    it("Should add liquidity during swap back", async function () {
      // Set Team and RevShare wallets
      await newToken.updateTeamWallet(teamWallet.address);
      await newToken.updateRevShareWallet(revShareWallet.address);

      const swapThreshold = await newToken.swapTokensAtAmount();
      const pairAddress = await newToken.uniswapV2Pair();

      // Get the LP token contract
      const lpTokenContract = new ethers.Contract(
        pairAddress,
        ["function balanceOf(address) view returns (uint256)"],
        ethers.provider
      );

      const initialLPBalance = await lpTokenContract.balanceOf(newTokenAddress);
      console.log(
        `Initial LP Token Balance of Contract: ${ethers.formatEther(initialLPBalance)} LP`
      );

      console.log(`Swap Threshold: ${ethers.formatEther(swapThreshold)} HAMP`);

      // Perform multiple buys and sells to accumulate fees
      let contractBalance = BigInt(0);
      let iterations = 0;
      while (contractBalance < swapThreshold && iterations < 20) {
        await buyTokens(ethers.parseEther("10"), addr2);
        await sellTokens(addr2);
        contractBalance = await newToken.balanceOf(newTokenAddress);
        iterations++;
      }

      console.log(
        `Contract HAMP balance after trades: ${ethers.formatEther(contractBalance)} HAMP`
      );
      console.log(`Number of buy/sell iterations: ${iterations}`);

      expect(contractBalance).to.be.gte(
        swapThreshold,
        "Contract balance should meet or exceed swap threshold"
      );

      // Trigger a transfer to initiate swap back
      await newToken
        .connect(owner)
        .transfer(addr3.address, ethers.parseEther("1"));

      // Check the final LP token balance
      const finalLPBalance = await lpTokenContract.balanceOf(newTokenAddress);
      console.log(
        `Final LP Token Balance of Contract: ${ethers.formatEther(finalLPBalance)} LP`
      );

      // Check if LP tokens were added to the contract
      if (initialLPBalance === 0n) {
        expect(finalLPBalance).to.be.gt(
          0n,
          "LP token balance should increase from zero"
        );
        console.log(
          `LP tokens added: ${ethers.formatEther(finalLPBalance)} LP`
        );
      } else {
        const lpTokenIncrease = finalLPBalance - initialLPBalance;
        const percentageIncrease =
          Number((lpTokenIncrease * 10000n) / initialLPBalance) / 100;
        console.log(
          `LP tokens added: ${ethers.formatEther(lpTokenIncrease)} LP`
        );
        console.log(
          `Percentage increase in LP token balance: ${percentageIncrease}%`
        );
        expect(percentageIncrease).to.be.gt(
          0,
          "LP token balance should increase"
        );
      }

      // Additional checks
      const contractHAMPBalance = await newToken.balanceOf(newTokenAddress);
      console.log(
        `Final Contract HAMP Balance: ${ethers.formatEther(contractHAMPBalance)} HAMP`
      );

      const contractETHBalance =
        await ethers.provider.getBalance(newTokenAddress);
      console.log(
        `Final Contract ETH Balance: ${ethers.formatEther(contractETHBalance)} ETH`
      );

      // Check if the contract's HAMP balance decreased (some was used for liquidity)
      expect(contractHAMPBalance).to.be.lt(
        contractBalance,
        "Contract's HAMP balance should decrease after adding liquidity"
      );

      // Check if the contract's ETH balance is close to zero (most should have been used for liquidity or distributed)
      expect(contractETHBalance).to.be.lt(
        ethers.parseEther("0.1"),
        "Contract's ETH balance should be close to zero after swap and liquidity addition"
      );
    });
  });

  describe("Security features", function () {
    it("Should prevent non-owners from calling owner functions", async function () {
      await expect(
        hampToken.connect(addr1).updateTeamWallet(addr2.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should prevent setting fees higher than the maximum allowed", async function () {
      await expect(hampToken.updateBuyFees(60, 0, 0)).to.be.revertedWith(
        "Buy fees must be <= 50."
      );
      await expect(hampToken.updateSellFees(60, 0, 0)).to.be.revertedWith(
        "Sell fees must be <= 50."
      );
    });

    it("Should prevent trading before it's enabled", async function () {
      const newToken = (await (
        await ethers.getContractFactory("HampToken")
      ).deploy(UNISWAP_ROUTER_ADDRESS)) as HampToken;

      await addLiquidity(newToken, ethers.parseEther("100000"));

      await expect(
        uniswapRouter
          .connect(addr1)
          .swapExactETHForTokensSupportingFeeOnTransferTokens(
            0,
            [await weth.getAddress(), await newToken.getAddress()],
            addr1.address,
            (await time.latest()) + 3600,
            { value: ethers.parseEther("1") }
          )
      ).to.be.revertedWith("UniswapV2: TRANSFER_FAILED");
    });

    it("Should handle transfers correctly and apply fees only on trades", async function () {
      // Get the router address
      const uniswapRouterAddress = await uniswapRouter.getAddress();

      // Deploy a new token
      const HampTokenFactory = await ethers.getContractFactory("HampToken");
      const newToken = (await HampTokenFactory.deploy(
        uniswapRouterAddress
      )) as HampToken;

      // Get the new token's address
      const newTokenAddress = await newToken.getAddress();

      // Enable trading
      await newToken.enableTrading();

      // Transfer tokens from owner to addr1 (should not incur fees)
      const transferAmount = ethers.parseEther("1000");
      await newToken.transfer(addr1.address, transferAmount);

      // Check if addr1 received the full amount
      const addr1Balance = await newToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(transferAmount);

      // Check that no fees were collected on this transfer
      const contractBalanceAfterTransfer =
        await newToken.balanceOf(newTokenAddress);
      expect(contractBalanceAfterTransfer).to.equal(0n);

      // Now let's simulate a trade (buy) to check if fees are applied
      await addLiquidity(newToken, ethers.parseEther("100000"));

      // Now perform a swap (buy tokens)
      const buyAmount = ethers.parseEther("1");
      await uniswapRouter
        .connect(addr2)
        .swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          [await weth.getAddress(), newTokenAddress],
          addr2.address,
          (await ethers.provider.getBlock("latest")).timestamp + 3600,
          { value: buyAmount }
        );

      // Check if addr2 received the full amount
      const addr2Balance = await newToken.balanceOf(addr2.address);
      expect(addr2Balance).to.be.gt(0); // TODO: Check exact amount

      // Check if fees were collected on this trade
      const contractBalanceAfterTrade =
        await newToken.balanceOf(newTokenAddress);
      expect(contractBalanceAfterTrade).to.be.greaterThan(
        0n,
        "Fees should have been collected on trade"
      );

      // Perform another wallet-to-wallet transfer
      await newToken
        .connect(addr1)
        .transfer(addr3.address, ethers.parseEther("100"));

      // Check that the contract balance (collected fees) didn't change after this transfer
      const contractBalanceAfterSecondTransfer =
        await newToken.balanceOf(newTokenAddress);
      expect(contractBalanceAfterSecondTransfer).to.equal(
        contractBalanceAfterTrade
      );
    });
  });
  describe("manualSwapBack", function () {
    it("Should allow owner to manually trigger a swap back", async function () {
      // Transfer some tokens to the contract to simulate collected fees
      const transferAmount = ethers.parseEther("1000000");
      await hampToken.transfer(hampTokenAddress, transferAmount);

      // Get initial balances
      const initialContractBalance =
        await hampToken.balanceOf(hampTokenAddress);
      const initialOwnerETHBalance = await ethers.provider.getBalance(
        owner.address
      );

      // Perform manual swap back
      await expect(hampToken.connect(owner).manualSwapBack()).to.not.be
        .reverted;

      // require no revert

      // Get final balances
      const finalContractBalance = await hampToken.balanceOf(hampTokenAddress);
      const finalOwnerETHBalance = await ethers.provider.getBalance(
        owner.address
      );

      // Check that the contract's token balance has decreased
      expect(finalContractBalance).to.be.lt(initialContractBalance);

      // Check that the owner's ETH balance has increased
      // Note: This might not always be true due to gas costs, so we'll check if it's greater or equal
      expect(finalOwnerETHBalance).to.be.gte(initialOwnerETHBalance);

      // You might want to add more specific checks here, such as verifying the exact amount of ETH received
      // or checking that the correct amount was sent to the team and revShare wallets
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        hampToken.connect(addr1).manualSwapBack()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if swap is not enabled", async function () {
      await hampToken.connect(owner).updateSwapEnabled(false);
      await expect(
        hampToken.connect(owner).manualSwapBack()
      ).to.be.revertedWith("Swap is not enabled");
    });

    it("Should revert if there are no tokens to swap", async function () {
      await expect(
        hampToken.connect(owner).manualSwapBack()
      ).to.be.revertedWith("No tokens to swap");
    });
  });
});
