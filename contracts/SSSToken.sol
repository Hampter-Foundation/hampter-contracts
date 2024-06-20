// SPDX-License-Identifier: MIT
//
//  $$$$$$\         $$$$$$\         $$$$$$\  
// $$  __$$\       $$  __$$\       $$  __$$\ 
// $$ /  \__|      $$ /  \__|      $$ /  \__|
// \$$$$$$\        \$$$$$$\        \$$$$$$\  
//  \____$$\        \____$$\        \____$$\ 
// $$\   $$ |      $$\   $$ |      $$\   $$ |
// \$$$$$$  |      \$$$$$$  |      \$$$$$$  |
//  \______/        \______/        \______/ 
//
// https://sss.game/
// https://blastscan.io/token/0xfd4D19F9FBb9F730C3C88a21755832BD2455144e#code
pragma solidity ^0.8.20;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";
import {IBlast, IBlastPoints} from "./interfaces/IBlast.sol";

interface IUniswapFactory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

contract SSS is Ownable2Step,  ERC20, ERC20Burnable, ERC20Permit {
    uint256 constant TOTAL_SUPPLY = 555_555_555_555_555 * 10**18; // 555.555 trillions

    uint256 constant DEX_SUPPLY         = TOTAL_SUPPLY*80/100; // 80%
    uint256 constant ECOSYSTEM_SUPPLY   = TOTAL_SUPPLY*5/100; // 5%
    uint256 constant BOOSTER_SUPPLY     = TOTAL_SUPPLY*5/100; // 5%
    uint256 constant AIRDROP_SUPPLY     = TOTAL_SUPPLY*5/100; // 5%
    uint256 constant DEV_SUPPLY         = TOTAL_SUPPLY*5/100; // 5%

    address public communityAddress;
    address public devTaxReceiverAddress;
    address public devTokenReceiverAddress;

    uint256 public buyTaxPercent = 4_00; // 4%
    uint256 public sellTaxPercent = 4_00; // 4%

    uint256 public devPercent = 20_00; // 0.4% = 30% of 4%
    uint256 public communityPercent = 20_00; // 1.6% = 20% of 2%
    uint public liqudityPercent = 30_00; // 30% of 2%

    uint256 public devTaxTokenAmountAvailable;
    uint256 public communityTaxTokenAmountAvailable;

    uint256 public devTokenAmountClaimable; // unlock from DEV_SUPPLY
    uint256 public devTokenAmountRemain; // unlock from DEV_SUPPLY
    uint256 public tradeVolume;
    uint256 public totalTaxAmount;

    // Swapback refers to when tax hits certain hamp tokens, it would get converted into ETH
    uint256 public swapTokensAtAmount; // Amount of tokens accrued before swapback to ETH


    address public immutable uniswapV2Pair;
    IUniswapV2Router02 public immutable uniswapV2Router;
    IBlast public immutable blastGasModeContract;

    uint256 public startPoolTime;
    bool public isMigrationCompleted = false;
    bool public isTradingEnabled = false;

    mapping(address => bool) public liquidityPools;
    mapping(address => bool) public excludeFromTaxes;

    mapping(address => bool) public preMigrationOperators;
    mapping(address => bool) public restrictedTradingPools;

    mapping(address => bool) blacklisted;  // Anti-bot and anti-whale mappings variables

    event SetLiquidityPool(address pool, bool isPool);
    event ClaimGasFee(address recipient, uint256 amount);

    event DevClaimTax(address indexed to, uint256 amount);
    event DevClaimUnlockToken(address indexed to, uint256 amount);
    event CommunityClaimTax(address indexed to, uint256 amount);

    event MigrationCompleted();
    event SetPreMigrationOperator(address operator, bool isOperator);
    event SetRestrictedTradingPool(address pool, bool isRestricted);
    event SetCommunityAddress(address community);
    event SetDevAddress(address devTaxReceiver, address devTokenReceiver);
    event ChangeTaxPercent(uint256 buyTax, uint256 sellTax, uint256 dev, uint256 community);
    event SetExcludeFromTax(address account, bool exclude);
    event RescueToken(address tokenAddress, address to, uint256 amount);
    event RescueETH(uint256 amount);
    event InitPool(uint256 ethAmount, uint256 tokenAmount);

    constructor(
        address communityReceiver,
        address devTaxReceiver,
        address devTokenReceiver,
        address routerAddress, // 0x98994a9A7a2570367554589189dC9772241650f6 // thruster router
        address blastGasModeContractAddress,
        address blastPointAddress,
        address blastPointOperator,
        uint256 tradingVol
    ) ERC20("SSS", "SSS") ERC20Permit("SSS") Ownable(msg.sender) {
        communityAddress = communityReceiver;
        devTaxReceiverAddress = devTaxReceiver;
        devTokenReceiverAddress = devTokenReceiver;

        _setExcludeFromTax(address(this), true);

        uniswapV2Router = IUniswapV2Router02(routerAddress);

        _mint(msg.sender, TOTAL_SUPPLY); // manually distribute to other addresses

        // create pair in advance without LP
        IUniswapFactory uniswapV2Factory = IUniswapFactory(uniswapV2Router.factory());
        uniswapV2Pair = uniswapV2Factory.createPair(address(this), uniswapV2Router.WETH());
        liquidityPools[uniswapV2Pair] = true;

        blastGasModeContract = IBlast(blastGasModeContractAddress);
        blastGasModeContract.configureClaimableGas();
        IBlastPoints(blastPointAddress).configurePointsOperator(blastPointOperator);

        // migrate data
        tradeVolume = tradingVol;

        devTokenAmountRemain = DEV_SUPPLY;
        devTokenAmountClaimable = _calculateUnlockTokenForDev(tradingVol);
        devTokenAmountRemain = DEV_SUPPLY - devTokenAmountClaimable;

        // comunity get 1.6%, dev get 0.4% of total trade volume
        devTaxTokenAmountAvailable = tradingVol * 40 / 100_00;
        communityTaxTokenAmountAvailable = tradingVol * 160 / 100_00;

        preMigrationOperators[msg.sender] = true;
        preMigrationOperators[address(this)] = true;

                swapTokensAtAmount = (totalSupply * 5) / 10000; // 0.05% of total supply
    }

    function _update(address from, address to, uint256 amount) internal override virtual {
        // don't check if it is minting or burning
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }

        _preCheck(from, to);

        uint256 taxAmount = _calculateTax(from, to, amount);
        uint256 amountAfterTax = amount - taxAmount;

        if(taxAmount > 0) {
            super._update(from, address(this), taxAmount);
            _recordTax(taxAmount);
        }

        _unlockTokenForDev(from, to, amount);

        super._update(from, to, amountAfterTax);
    }

    function _preCheck(address from, address to) internal view {
        // check pre migration
        if(!isMigrationCompleted) {
            require(preMigrationOperators[from], "Migration not completed");
        }

        // check trading pool
        if(restrictedTradingPools[from] || restrictedTradingPools[to]) {
            revert("Trading pool is restricted");
        }
    }


    function isLiquidityPool(address addr) internal view returns (bool) {
        return liquidityPools[addr];
    }

    function _addETHLiquidity(uint256 ethAmount, uint256 tokenAmount) internal {
        require(address(this).balance >= ethAmount, "Invalid ETH amount");

        _approve(address(this), address(uniswapV2Router), tokenAmount);
        uniswapV2Router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0, // accept any amount of ETH
            0, // accept any amount of token
            address(this),
            block.timestamp
        );

        _approve(address(this), address(uniswapV2Router), 0);
    }

    function _calculateTax(address from, address to, uint256 amount) internal view returns (uint256 taxAmount){
        if (excludeFromTaxes[from] || excludeFromTaxes[to]) {
            return 0;
        }

        // only apply tax if buy and sell
        uint256 taxPercent = 0;
        if(isLiquidityPool(from)) {
            taxPercent = buyTaxPercent;
        } else if(isLiquidityPool(to)) {
            taxPercent = sellTaxPercent;
        }

        if (taxPercent == 0) {
            return 0;
        }

        taxAmount = amount * taxPercent / 100_00;
        return taxAmount;
    }

    function _recordTax(uint256 taxAmount) internal {
        uint256 communityTaxAmount = taxAmount * communityPercent / 100_00;
        uint256 devAmount = taxAmount - communityTaxAmount;
        devTaxTokenAmountAvailable += devAmount;
        communityTaxTokenAmountAvailable += communityTaxAmount;
        totalTaxAmount += taxAmount;
        // TODO: Add Liqudiity amount
    }

    function _unlockTokenForDev(address from, address to, uint256 amount) internal {
        if(!isLiquidityPool(from) && !isLiquidityPool(to)) {
            return;
        }
        if(startPoolTime == 0) {
            return;
        }

        tradeVolume += amount;

        uint256 unlockAmount = _calculateUnlockTokenForDev(amount);
        if(unlockAmount > 0) {
            devTokenAmountClaimable += unlockAmount;
            devTokenAmountRemain -= unlockAmount; // unlockAmount is always <= devTokenAmountRemain
        }
    }

    function _calculateUnlockTokenForDev(uint256 amount) internal view returns (uint256) {
        uint256 devRemainToken = devTokenAmountRemain;
        if(devRemainToken == 0) {
            return 0;
        }

        // Target volume is 160 times of total supply
        uint256 targetVolume = 160*TOTAL_SUPPLY;
        uint256 unlockAmount = amount * DEV_SUPPLY / targetVolume;

        if(unlockAmount > devRemainToken) {
            unlockAmount = devRemainToken;
        }
        return unlockAmount;
    }

    function initPool(uint256 ethAmount, uint256 tokenAmount) onlyOwner external {
        require(startPoolTime == 0, "Pool already initialized");
        _addETHLiquidity(ethAmount, tokenAmount);
        startPoolTime = block.timestamp;
        emit InitPool(ethAmount, tokenAmount);
    }

    function addLiquidity(uint256 ethAmount, uint256 tokenAmount) onlyOwner external {
        require(startPoolTime > 0, "Pool not initialized");
        _addETHLiquidity(ethAmount, tokenAmount);
    }
    
    /// @dev Swaps $HAMP for ETH
    function swapTokensForEth(uint256 tokenAmount) private {
        // generate the uniswap pair path of token -> weth
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = uniswapV2Router.WETH();

        _approve(address(this), address(uniswapV2Router), tokenAmount);

        // make the swap
        uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0, // accept any amount of ETH
            path,
            address(this),
            block.timestamp
        );
    }

    function claimCommunityTax() external returns (uint256 amount) {
        amount = communityTaxTokenAmountAvailable;
        require(amount > 0, "No community tax available");
        require(msg.sender == communityAddress, "Invalid sender");

        emit CommunityClaimTax(msg.sender, amount);

        communityTaxTokenAmountAvailable = 0;

        _transfer(address(this), msg.sender, amount);
    }

    // Everyone can call this function to claim dev tax
    function claimDevTax() external returns (uint256 amount) {
        amount = devTaxTokenAmountAvailable;
        require(amount > 0, "No dev tax available");
        emit DevClaimTax(devTaxReceiverAddress, amount);

        devTaxTokenAmountAvailable = 0;

        _transfer(address(this), devTaxReceiverAddress, amount);
    }

    function claimDevToken() external returns (uint256 amount) {
        amount = devTokenAmountClaimable;
        require(amount > 0, "No dev token available");

        emit DevClaimUnlockToken(devTokenReceiverAddress, amount);

        devTokenAmountClaimable = 0;

        _transfer(address(this), devTokenReceiverAddress, amount);
    }

    function setExcludeFromTax(address account, bool exclude) external onlyOwner {
        require(account != address(this), "Cannot exclude contract address");
        _setExcludeFromTax(account, exclude);
    }

    function _setExcludeFromTax(address account, bool exclude) internal {
        excludeFromTaxes[account] = exclude;
        emit SetExcludeFromTax(account, exclude);
    }

    function setCommunityAddress(address community) external onlyOwner {
        communityAddress = community;
        emit SetCommunityAddress(community);
    }

    function setDevAddress(address devTaxReceiver, address devTokenReceiver) external onlyOwner {
        devTaxReceiverAddress = devTaxReceiver;
        devTokenReceiverAddress = devTokenReceiver;

        emit SetDevAddress(devTaxReceiver, devTokenReceiver);
    }

    function setLiquidityPool(address pool, bool isPool) external onlyOwner {
        liquidityPools[pool] = isPool;
        emit SetLiquidityPool(pool, isPool);
    }

    function changeTaxPercent(uint256 buyTax, uint256 sellTax, uint256 dev, uint256 community) external onlyOwner {
        if(buyTax > 5_00 || sellTax > 5_00) revert ("Too high tax");
        require(dev + community == 100_00, "Invalid percent");
        buyTaxPercent = buyTax;
        sellTaxPercent = sellTax;

        devPercent = dev;
        communityPercent = community;
        emit ChangeTaxPercent(buyTax, sellTax, dev, community);
    }

    function rescueToken(address tokenAddress, address to, uint256 amount) external onlyOwner {
        if(tokenAddress == address(this)) {
            require(startPoolTime + 365 days < block.timestamp, "Cannot rescue this token");
        }

        SafeERC20.safeTransfer(IERC20(tokenAddress), to, amount);
        emit RescueToken(tokenAddress, to, amount);
    }

    function rescueETH(uint256 amount) external onlyOwner {
        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "RescueETH failed");

        emit RescueETH(amount);
    }

    function claimGasFee(address recipient) external onlyOwner {
        uint256 amount = blastGasModeContract.claimMaxGas(address(this), recipient);
        emit ClaimGasFee(recipient, amount);
    }

    function configBlastPointsOperator(address blastPointAddress, address operator) external onlyOwner {
        IBlastPoints(blastPointAddress).configurePointsOperator(operator);
    }

    function setRestrictedTradingPool(address pool, bool isRestricted) external onlyOwner {
        restrictedTradingPools[pool] = isRestricted;
        emit SetRestrictedTradingPool(pool, isRestricted);
    }

    /// =========================== SwapBack Functions =========================== ///
/**
     * @dev Swaps the tokens collected as fees into ETH and splits them into three parts:
     * 1. ETH for liquidity for $HAM - 1%
     * 2. ETH for ecosystem development - 2%
     * 3. ETH for PVE and PVP rewards - 2%
     * The Swap happens when the contract accrues more than 500 $HAM tokens.
     */
    function swapBack() private {
        uint256 contractBalance = balanceOf(address(this));
        uint256 totalTokensToSwap = tokensForLiquidity +
            tokensForRevShare +
            tokensForTeam;

        if (contractBalance == 0 || totalTokensToSwap == 0) {
            return;
        }

        if (contractBalance > swapTokensAtAmount * 20) {
            contractBalance = swapTokensAtAmount * 20;
        }

        // Halve the amount of liquidity tokens
        uint256 liquidityTokens = (contractBalance * tokensForLiquidity) /
            totalTokensToSwap /
            2;
        uint256 amountToSwapForETH = contractBalance - liquidityTokens;

        uint256 initialETHBalance = address(this).balance;

        swapTokensForEth(amountToSwapForETH);

        uint256 ethBalance = address(this).balance - initialETHBalance;

        uint256 ethForRevShare = ethBalance * tokensForRevShare / (
            totalTokensToSwap - (tokensForLiquidity / 2)
        );

        uint256 ethForTeam = ethBalance * tokensForTeam / (
            totalTokensToSwap - (tokensForLiquidity / 2)
        );

        uint256 ethForLiquidity = ethBalance - ethForRevShare - ethForTeam;

        tokensForLiquidity = 0;
        tokensForRevShare = 0;
        tokensForTeam = 0;

        payable(teamWallet).safeTransferETH(ethForTeam);

        if (liquidityTokens > 0 && ethForLiquidity > 0) {
            addLiquidity(liquidityTokens, ethForLiquidity);
            emit SwapAndLiquify(
                amountToSwapForETH,
                ethForLiquidity,
                tokensForLiquidity
            );
        }

        payable(revShareWallet).safeTransferETH(address(this).balance);
    }


    /// =========================== Blacklist Functions =========================== ///

    function isBlacklisted(address account) public view returns (bool) {
        return blacklisted[account];
    }
    function blacklist(address _addr) public onlyOwner {
        require(
            _addr != address(uniswapV2Pair) &&
               // TODO change this to thruster router 
                _addr != address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D),
            "Cannot blacklist token's v2 router or v2 pool."
        );
        blacklisted[_addr] = true;
    }

    /// @dev blacklist v3 pools; can unblacklist() down the road to suit project and community
    // TODO: do we want this in?
    function blacklistLiquidityPool(address lpAddress) public onlyOwner {
        require(
            lpAddress != address(uniswapV2Pair) &&
                lpAddress !=
                // TODO change this 
                address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D),
            "Cannot blacklist token's v2 router or v2 pool."
        );
        blacklisted[lpAddress] = true;
    }

    /// @dev unblacklist address; not affected by blacklistRenounced incase team wants to unblacklist v3 pools down the road
    function unblacklist(address _addr) public onlyOwner {
        blacklisted[_addr] = false;
    }

    /// @dev Owner has to enable trading before the token can be traded
    function enableTrading() external onlyOwner {
        isTradingEnabled = true;
    }

    /// @dev This is to disable trading in case of emergency
    function disableTrading() external onlyOwner {
        isTradingEnabled = false;
    }

    receive() external payable {}
}