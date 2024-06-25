import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
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
  let HampToken: Contract;
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
  const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10 million tokens
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

  describe("Fee Taxing", function () {
    // Add liquidity to the pair
    before(async function () {
      console.log("Pair address:", pair);
      console.log("HampToken address:", hampTokenAddress);
      console.log("Owner address:", owner.address);
      // Check balances before adding liquidity
      const ownerEthBalance = await ethers.provider.getBalance(owner.address);
      const ownerTokenBalance = await hampToken.balanceOf(owner.address);
      console.log("Owner ETH balance:", ethers.formatEther(ownerEthBalance));
      console.log(
        "Owner token balance:",
        ethers.formatEther(ownerTokenBalance)
      );

      // Approve a smaller amount for liquidity
      const liquidityTokenAmount = ethers.parseEther("100000"); // 100,000 tokens
      const liquidityEthAmount = ethers.parseEther("10"); // 10 ETH

      await hampToken.approve(
        await uniswapRouter.getAddress(),
        liquidityTokenAmount
      );

      // Add initial liquidity with lower amounts
      try {
        const tx = await uniswapRouter.addLiquidityETH(
          hampTokenAddress,
          liquidityTokenAmount,
          0, // slippage is unavoidable
          0, // slippage is unavoidable
          owner.getAddress(),
          (await time.latest()) + 3600,
          { value: liquidityEthAmount }
        );
        await tx.wait();
        console.log("Liquidity added successfully");
      } catch (error) {
        console.error("Error adding liquidity:", error);
        throw error;
      }
      // Check LP token balance
      const lpTokenBalance = await hampToken.balanceOf(pair);
      console.log("LP token balance:", ethers.formatEther(lpTokenBalance));
    });

    it("Should apply buy fees correctly", async function () {
      const initialContractBalance =
        await hampToken.balanceOf(hampTokenAddress);

      await uniswapRouter
        .connect(addr1)
        .swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          [await weth.getAddress(), hampTokenAddress],
          addr1.address,
          (await time.latest()) + 3600,
          { value: ethers.parseEther("1") }
        );

      const addr1Balance = await hampToken.balanceOf(addr1.address);
      const finalContractBalance = await hampToken.balanceOf(hampTokenAddress);

      expect(finalContractBalance).to.be.gt(initialContractBalance);
      expect(addr1Balance).to.be.gt(0);
    });

    it("Should apply sell fees correctly", async function () {
      const initialContractBalance =
        await hampToken.balanceOf(hampTokenAddress);

      // First buy tokens
      await uniswapRouter
        .connect(addr1)
        .swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          [await weth.getAddress(), hampTokenAddress],
          addr1.address,
          (await time.latest()) + 3600,
          { value: ethers.parseEther("1") }
        );

      const addr1Balance = await hampToken.balanceOf(addr1.address);

      // Then sell tokens
      await hampToken
        .connect(addr1)
        .approve(await uniswapRouter.getAddress(), addr1Balance);
      await uniswapRouter
        .connect(addr1)
        .swapExactTokensForETHSupportingFeeOnTransferTokens(
          addr1Balance,
          0,
          [hampTokenAddress, await weth.getAddress()],
          addr1.address,
          (await time.latest()) + 3600
        );

      const finalContractBalance = await hampToken.balanceOf(hampTokenAddress);
      expect(finalContractBalance).to.be.gt(initialContractBalance);
    });

    it("Should not apply fees to excluded addresses", async function () {
      await hampToken.excludeFromFees(addr1.address, true);

      const initialBalance = await hampToken.balanceOf(addr1.address);
      const transferAmount = ethers.parseEther("1000");

      await hampToken.transfer(addr1.address, transferAmount);

      const finalBalance = await hampToken.balanceOf(addr1.address);
      expect(finalBalance - initialBalance).to.equal(transferAmount);
    });
  });

  describe("Swap Back", function () {
    // Add liquidity to the pair
    before(async function () {
      // Check balances before adding liquidity
      const ownerEthBalance = await ethers.provider.getBalance(owner.address);
      const ownerTokenBalance = await hampToken.balanceOf(owner.address);
      console.log("Owner ETH balance:", ethers.formatEther(ownerEthBalance));
      console.log(
        "Owner token balance:",
        ethers.formatEther(ownerTokenBalance)
      );

      // Approve a smaller amount for liquidity
      const liquidityTokenAmount = ethers.parseEther("100000"); // 100,000 tokens
      const liquidityEthAmount = ethers.parseEther("10"); // 10 ETH

      await hampToken.approve(
        await uniswapRouter.getAddress(),
        liquidityTokenAmount
      );

      // Add initial liquidity with lower amounts
      try {
        const tx = await uniswapRouter.addLiquidityETH(
          hampTokenAddress,
          liquidityTokenAmount,
          0, // slippage is unavoidable
          0, // slippage is unavoidable
          owner.address,
          (await time.latest()) + 3600,
          { value: liquidityEthAmount }
        );
        await tx.wait();
        console.log("Liquidity added successfully");
      } catch (error) {
        console.error("Error adding liquidity:", error);
        throw error;
      }

      // Check balances after adding liquidity
      const finalOwnerEthBalance = await ethers.provider.getBalance(
        owner.address
      );
      const finalOwnerTokenBalance = await hampToken.balanceOf(owner.address);
      console.log(
        "Final owner ETH balance:",
        ethers.formatEther(finalOwnerEthBalance)
      );
      console.log(
        "Final owner token balance:",
        ethers.formatEther(finalOwnerTokenBalance)
      );
    });

    it("Should perform swap back when threshold is met", async function () {
      const initialTeamBalance = await ethers.provider.getBalance(
        teamWallet.address
      );
      const initialRevShareBalance = await ethers.provider.getBalance(
        revShareWallet.address
      );

      // Perform multiple sells to accumulate fees
      for (let i = 0; i < 5; i++) {
        await uniswapRouter
          .connect(addr2)
          .swapExactETHForTokensSupportingFeeOnTransferTokens(
            0,
            [await weth.getAddress(), hampTokenAddress],
            addr2.address,
            (await time.latest()) + 3600,
            { value: ethers.parseEther("1") }
          );

        const addr2Balance = await hampToken.balanceOf(addr2.address);
        await hampToken
          .connect(addr2)
          .approve(await uniswapRouter.getAddress(), addr2Balance);
        await uniswapRouter
          .connect(addr2)
          .swapExactTokensForETHSupportingFeeOnTransferTokens(
            addr2Balance,
            0,
            [hampTokenAddress, await weth.getAddress()],
            addr2.address,
            (await time.latest()) + 3600
          );
      }

      // Trigger a transfer to initiate swap back
      await hampToken.transfer(addr3.address, ethers.parseEther("1"));

      const finalTeamBalance = await ethers.provider.getBalance(
        teamWallet.address
      );
      const finalRevShareBalance = await ethers.provider.getBalance(
        revShareWallet.address
      );

      expect(finalTeamBalance).to.be.gt(initialTeamBalance);
      expect(finalRevShareBalance).to.be.gt(initialRevShareBalance);
    });

    it("Should not perform swap back if threshold is not met", async function () {
      const initialTeamBalance = await ethers.provider.getBalance(
        teamWallet.address
      );
      const initialRevShareBalance = await ethers.provider.getBalance(
        revShareWallet.address
      );

      // Perform a small sell
      await uniswapRouter
        .connect(addr2)
        .swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          [await weth.getAddress(), hampTokenAddress],
          addr2.address,
          (await time.latest()) + 3600,
          { value: ethers.parseEther("0.1") }
        );

      const addr2Balance = await hampToken.balanceOf(addr2.address);
      await hampToken
        .connect(addr2)
        .approve(await uniswapRouter.getAddress(), addr2Balance);
      await uniswapRouter
        .connect(addr2)
        .swapExactTokensForETHSupportingFeeOnTransferTokens(
          addr2Balance,
          0,
          [hampTokenAddress, await weth.getAddress()],
          addr2.address,
          (await time.latest()) + 3600
        );

      // Trigger a transfer
      await hampToken.transfer(addr3.address, ethers.parseEther("1"));

      const finalTeamBalance = await ethers.provider.getBalance(
        teamWallet.address
      );
      const finalRevShareBalance = await ethers.provider.getBalance(
        revShareWallet.address
      );

      expect(finalTeamBalance).to.equal(initialTeamBalance);
      expect(finalRevShareBalance).to.equal(initialRevShareBalance);
    });
  });

  describe("Liquidity Addition", function () {
    it("Should add liquidity during swap back", async function () {
      const initialPairBalance = await hampToken.balanceOf(pair);

      // Perform multiple sells to accumulate fees
      for (let i = 0; i < 10; i++) {
        await uniswapRouter
          .connect(addr2)
          .swapExactETHForTokensSupportingFeeOnTransferTokens(
            0,
            [await weth.getAddress(), hampTokenAddress],
            addr2.address,
            (await time.latest()) + 3600,
            { value: ethers.parseEther("1") }
          );

        const addr2Balance = await hampToken.balanceOf(addr2.address);
        await hampToken
          .connect(addr2)
          .approve(await uniswapRouter.getAddress(), addr2Balance);
        await uniswapRouter
          .connect(addr2)
          .swapExactTokensForETHSupportingFeeOnTransferTokens(
            addr2Balance,
            0,
            [hampTokenAddress, await weth.getAddress()],
            addr2.address,
            (await time.latest()) + 3600
          );
      }

      // Trigger a transfer to initiate swap back
      await hampToken.transfer(addr3.address, ethers.parseEther("1"));

      const finalPairBalance = await hampToken.balanceOf(pair);
      expect(finalPairBalance).to.be.gt(initialPairBalance);
    });
  });

  describe("Owner functions", function () {
    it("Should allow owner to update team wallet", async function () {
      await hampToken.updateTeamWallet(addr1.address);
      expect(await hampToken.teamWallet()).to.equal(addr1.address);
    });

    it("Should allow owner to update revShare wallet", async function () {
      await hampToken.updateRevShareWallet(addr1.address);
      expect(await hampToken.revShareWallet()).to.equal(addr1.address);
    });

    it("Should allow owner to exclude address from fees", async function () {
      await hampToken.excludeFromFees(addr1.address, true);
      expect(await hampToken.isExcludedFromFees(addr1.address)).to.be.true;
    });

    it("Should allow owner to include previously excluded address in fees", async function () {
      await hampToken.excludeFromFees(addr1.address, true);
      await hampToken.excludeFromFees(addr1.address, false);
      expect(await hampToken.isExcludedFromFees(addr1.address)).to.be.false;
    });

    it("Should allow owner to update buy fees", async function () {
      await hampToken.updateBuyFees(10, 10, 10);
      expect(await hampToken.buyRevShareFee()).to.equal(10);
      expect(await hampToken.buyLiquidityFee()).to.equal(10);
      expect(await hampToken.buyTeamFee()).to.equal(10);
    });

    it("Should allow owner to update sell fees", async function () {
      await hampToken.updateSellFees(10, 10, 10);
      expect(await hampToken.sellRevShareFee()).to.equal(10);
      expect(await hampToken.sellLiquidityFee()).to.equal(10);
      expect(await hampToken.sellTeamFee()).to.equal(10);
    });
  });

  describe.only("Security features", function () {
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
});
