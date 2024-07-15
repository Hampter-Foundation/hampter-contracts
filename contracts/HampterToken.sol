// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20} from "./lib/openzeppelin-v4.90/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "./lib/openzeppelin-v4.90/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "./lib/openzeppelin-v4.90/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20} from "./lib/openzeppelin-v4.90/contracts/token/ERC20/IERC20.sol";

import {Ownable} from "./lib/openzeppelin-v4.90/contracts/access/Ownable.sol";
import {SafeMath} from "./lib/openzeppelin-v4.90/contracts/utils/math/SafeMath.sol";
import {SafeTransferLib} from "./lib/solmate/src/utils/SafeTransferLib.sol";

// Interfaces
import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Factory} from "./interfaces/IUniswapV2Factory.sol";

// https://www.playhampter.com/
contract HampToken is ERC20, Ownable, ERC20Burnable, ERC20Permit {
    using SafeMath for uint256;
    using SafeTransferLib for address payable;

    IUniswapV2Router02 public immutable uniswapV2Router;
    address public immutable uniswapV2Pair;
    address public constant deadAddress = address(0xdead);

    /// @dev Reentrancy guard for swap operations
    /// When true, prevents recursive swaps during token transfers
    /// Acts as a mutex to ensure only one swap operation occurs at a time
    bool private isSwapInProgress;

    // track the paused state
    bool public paused;

    address public revShareWallet;
    address public teamWallet;

    bool public limitsInEffect = true;
    bool public tradingActive = false;
    bool public swapEnabled = false;

    // Anti-bot and anti-whale mappings and variables
    mapping(address => bool) blacklisted;

    uint256 private constant FEE_PERCENTAGE_SCALE = 10000; // 100.00%
    uint256 private constant MAX_SWAP_MULTIPLIER = 20; // Multiplier to cap the swap amonut of $HAMP in swapback
    uint256 public swapTokensAtAmount;
    uint256 public buyTotalFees;
    uint256 public buyRevShareFee;
    uint256 public buyLiquidityFee;
    uint256 public buyTeamFee;

    uint256 public sellTotalFees;
    uint256 public sellRevShareFee;
    uint256 public sellLiquidityFee;
    uint256 public sellTeamFee;

    uint256 public tokensForRevShare;
    uint256 public tokensForLiquidity;
    uint256 public tokensForTeam;

    /******************/

    // exclude addresses from fees and max transaction amount
    mapping(address => bool) private _isExcludedFromFees;

    // store addresses that a automatic market maker pairs. Any transfer *to* these addresses
    // could be subject to a maximum transfer amount
    mapping(address => bool) public automatedMarketMakerPairs;

    bool public preMigrationPhase = true;

    // the pre-migration phase is before the token is fully launched and traded.
    mapping(address => bool) public preMigrationTransferrable;

    event UpdateUniswapV2Router(
        address indexed newAddress,
        address indexed oldAddress
    );

    event ExcludeFromFees(address indexed account, bool isExcluded);

    event SetAutomatedMarketMakerPair(address indexed pair, bool indexed value);

    event revShareWalletUpdated(
        address indexed newWallet,
        address indexed oldWallet
    );

    event teamWalletUpdated(
        address indexed newWallet,
        address indexed oldWallet
    );

    event SwapAndLiquify(
        uint256 tokensSwapped,
        uint256 ethReceived,
        uint256 tokensIntoLiquidity
    );

    event SwapForETH(uint256 tokensSwapped);

    event Paused(address account);
    event Unpaused(address account);

    modifier whenPaused() {
        require(paused, "Contract is not paused");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    constructor(
        address _thrusterRouter
    ) ERC20("Hampter Token", "HAMP") Ownable() ERC20Permit("Hampter Token") {
        IUniswapV2Router02 _uniswapV2Router = IUniswapV2Router02(
            _thrusterRouter // 0x98994a9A7a2570367554589189dC9772241650f6 thruster router
        );

        uniswapV2Router = _uniswapV2Router;

        // create pair in advance without LP
        uniswapV2Pair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), _uniswapV2Router.WETH());

        _setAutomatedMarketMakerPair(address(uniswapV2Pair), true);
        uint256 totalSupply = 10_000_000 * 1e18; // 10 million tokens

        uint256 _buyRevShareFee = 20; // 2% goes to the players of the game as rewards.
        uint256 _buyLiquidityFee = 10; // 1% gets added back as liquidity provision to support the $HAMP economy.
        uint256 _buyTeamFee = 10; // 1% goes to the developers of Hampter

        uint256 _sellRevShareFee = 20; // 2% goes to the players of the game as rewards.
        uint256 _sellLiquidityFee = 10; // 1% gets added back as liquidity provision to support the $HAMP economy.
        uint256 _sellTeamFee = 10; // 1% goes to the developers of Hampter

        swapTokensAtAmount = (totalSupply * 5) / 10000; // 0.05% of total supply

        buyRevShareFee = _buyRevShareFee; // 2%
        buyLiquidityFee = _buyLiquidityFee; // 1%
        buyTeamFee = _buyTeamFee; // 2%
        buyTotalFees = buyRevShareFee + buyLiquidityFee + buyTeamFee; // 2% + 1% + 2% = 5%

        sellRevShareFee = _sellRevShareFee; // 2%
        sellLiquidityFee = _sellLiquidityFee; // 1%
        sellTeamFee = _sellTeamFee; // 2%
        sellTotalFees = sellRevShareFee + sellLiquidityFee + sellTeamFee; // 2% + 1% + 2% = 5%

        teamWallet = owner(); // set as team wallet
        revShareWallet = owner(); // intial revShare wallet address. Can be updated later.

        // exclude from paying fees or having max transaction amount
        excludeFromFees(owner(), true);
        excludeFromFees(address(this), true);
        excludeFromFees(address(0xdead), true);

        preMigrationTransferrable[owner()] = true;

        /*
            _mint is an internal function in ERC20.sol that is only called here,
            and CANNOT be called ever again
        */
        _mint(msg.sender, totalSupply);
    }

    /// @dev Owner has to enable trading before the token can be traded
    // once enabled, can never be turned off unless contract is paused.
    function enableTrading() external onlyOwner {
        tradingActive = true;
        swapEnabled = true;
        preMigrationPhase = false;
    }

    /// @dev Limits is for protection. remove limits once token is stable
    function removeLimits() external onlyOwner returns (bool) {
        limitsInEffect = false;
        return true;
    }

    /// @dev change the minimum amount of tokens before a swapback can be triggered
    function updateSwapTokensAtAmount(
        uint256 newAmount
    ) external onlyOwner returns (bool) {
        // TODO: Revisit this logic
        require(
            newAmount >= (totalSupply() * 1) / 100000,
            "Swap amount cannot be lower than 0.001% total supply."
        );
        require(
            newAmount <= (totalSupply() * 5) / 1000,
            "Swap amount cannot be higher than 0.5% total supply."
        );
        swapTokensAtAmount = newAmount;
        return true;
    }

    // only use to disable contract sales if absolutely necessary (emergency use only)
    function updateSwapEnabled(bool enabled) external onlyOwner {
        swapEnabled = enabled;
    }

    function updateBuyFees(
        uint256 _revShareFee,
        uint256 _liquidityFee,
        uint256 _teamFee
    ) external onlyOwner {
        buyRevShareFee = _revShareFee;
        buyLiquidityFee = _liquidityFee;
        buyTeamFee = _teamFee;
        buyTotalFees = buyRevShareFee + buyLiquidityFee + buyTeamFee;
        require(buyTotalFees <= 50, "Buy fees must be <= 50."); // 5%
    }

    function updateSellFees(
        uint256 _revShareFee,
        uint256 _liquidityFee,
        uint256 _teamFee
    ) external onlyOwner {
        sellRevShareFee = _revShareFee;
        sellLiquidityFee = _liquidityFee;
        sellTeamFee = _teamFee;
        sellTotalFees = sellRevShareFee + sellLiquidityFee + sellTeamFee;
        require(sellTotalFees <= 50, "Sell fees must be <= 50."); // 5%
    }

    function excludeFromFees(address account, bool excluded) public onlyOwner {
        _isExcludedFromFees[account] = excluded;
        emit ExcludeFromFees(account, excluded);
    }

    function setAutomatedMarketMakerPair(
        address pair,
        bool value
    ) public onlyOwner {
        require(
            pair != uniswapV2Pair,
            "The pair cannot be removed from automatedMarketMakerPairs"
        );

        _setAutomatedMarketMakerPair(pair, value);
    }

    function _setAutomatedMarketMakerPair(address pair, bool value) private {
        automatedMarketMakerPairs[pair] = value;

        emit SetAutomatedMarketMakerPair(pair, value);
    }

    function updateRevShareWallet(
        address newRevShareWallet
    ) external onlyOwner {
        emit revShareWalletUpdated(newRevShareWallet, revShareWallet);
        revShareWallet = newRevShareWallet;
    }

    function updateTeamWallet(address newWallet) external onlyOwner {
        emit teamWalletUpdated(newWallet, teamWallet);
        teamWallet = newWallet;
    }

    function isExcludedFromFees(address account) public view returns (bool) {
        return _isExcludedFromFees[account];
    }

    function isBlacklisted(address account) public view returns (bool) {
        return blacklisted[account];
    }

    /** @dev Override the transfer function to tax
     * The $HAMP taxed will be accumulated in the contract and swapped for ETH to be distributed to the team, revShare and liquidity after it has hit `swapTokensAtAmount`
     * */
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(!blacklisted[from], "Sender blacklisted");
        require(!blacklisted[to], "Receiver blacklisted");

        if (preMigrationPhase) {
            require(
                preMigrationTransferrable[from],
                "Not authorized to transfer pre-migration."
            );
        }

        bool isExcludedFrom = _isExcludedFromFees[from];
        bool isExcludedTo = _isExcludedFromFees[to];

        if (amount == 0) {
            super._transfer(from, to, 0);
            return;
        }

        if (limitsInEffect) {
            if (
                from != owner() &&
                to != owner() &&
                to != address(0) &&
                to != address(0xdead) &&
                !isSwapInProgress
            ) {
                if (!tradingActive) {
                    require(
                        isExcludedFrom || isExcludedTo,
                        "Trading is not active."
                    );
                }
            }
        }

        uint256 contractTokenBalance = balanceOf(address(this));

        // Check if the contract has accumulated enough $HAMP to trigger a _swapBack
        bool hasSufficientTokensForSwap = contractTokenBalance >=
            swapTokensAtAmount;

        if (
            hasSufficientTokensForSwap &&
            swapEnabled &&
            !isSwapInProgress &&
            !automatedMarketMakerPairs[from] &&
            !isExcludedFrom &&
            !isExcludedTo
        ) {
            isSwapInProgress = true;

            _swapBack();

            isSwapInProgress = false;
        }

        /// @dev Determines if fees should be applied to the current transfer
        /// Fees are not applied during swap operations to prevent double-charging
        bool shouldApplyFees = !isSwapInProgress;

        // if any account belongs to _isExcludedFromFee account then remove the fee
        if (isExcludedFrom || isExcludedTo) {
            shouldApplyFees = false;
        }

        uint256 fees = 0;
        // only take fees on buys/sells, do not take on wallet transfers
        if (shouldApplyFees) {
            // on sell
            if (automatedMarketMakerPairs[to] && sellTotalFees > 0) {
                fees = calculateFee(amount, sellTotalFees);

                _accountForFees(
                    fees,
                    sellLiquidityFee,
                    sellTeamFee,
                    sellRevShareFee,
                    sellTotalFees
                );
            }
            // on buy
            else if (automatedMarketMakerPairs[from] && buyTotalFees > 0) {
                fees = calculateFee(amount, buyTotalFees);
                _accountForFees(
                    fees,
                    buyLiquidityFee,
                    buyTeamFee,
                    buyRevShareFee,
                    buyTotalFees
                );
            }

            if (fees > 0) {
                super._transfer(from, address(this), fees);
            }

            amount -= fees;
        }

        super._transfer(from, to, amount);
    }

    /**
     * @dev Swaps the $HAMP tokens collected as fees into ETH and splits them into three parts:
     * 1. ETH for liquidity for $HAM - 1%
     * 2. ETH for ecosystem development - 2%
     * 3. ETH for PVE and PVP rewards - 2%
     * The Swap happens when the contract accrues more than 0.05% of total suply $HAM tokens.
     */
    function _swapBack() private {
        uint256 contractBalance = balanceOf(address(this));
        uint256 totalTokensToSwap = tokensForLiquidity +
            tokensForRevShare +
            tokensForTeam;

        if (contractBalance == 0 || totalTokensToSwap == 0) {
            return;
        }

        // Cap the swap amount to prevent price impact and ensure more frequent, smaller swaps
        if (contractBalance > swapTokensAtAmount * MAX_SWAP_MULTIPLIER) {
            contractBalance = swapTokensAtAmount * MAX_SWAP_MULTIPLIER;
        }

        // Calculate tokens for liquidity (halved)
        uint256 liquidityTokens = (contractBalance * tokensForLiquidity) /
            totalTokensToSwap /
            2;

        uint256 amountToSwapForETH = contractBalance - liquidityTokens;

        uint256 initialETHBalance = address(this).balance;

        _swapTokensForEth(amountToSwapForETH);

        uint256 ethBalance = address(this).balance.sub(initialETHBalance);

        uint256 ethForRevShare = ethBalance.mul(tokensForRevShare).div(
            totalTokensToSwap - (tokensForLiquidity / 2)
        );

        uint256 ethForTeam = ethBalance.mul(tokensForTeam).div(
            totalTokensToSwap - (tokensForLiquidity / 2)
        );

        uint256 ethForLiquidity = ethBalance - ethForRevShare - ethForTeam;

        // Reset token accumulators after processing
        tokensForLiquidity = 0;
        tokensForRevShare = 0;
        tokensForTeam = 0;

        payable(teamWallet).safeTransferETH(ethForTeam);

        // Adds Liquidity to LP
        if (liquidityTokens > 0 && ethForLiquidity > 0) {
            _addLiquidity(liquidityTokens, ethForLiquidity);
            emit SwapAndLiquify(
                amountToSwapForETH,
                ethForLiquidity,
                tokensForLiquidity
            );
        }

        payable(revShareWallet).safeTransferETH(address(this).balance);
    }

    /// @dev Accounts for the increase in tokens for different purposes based on collected fees
    function _accountForFees(
        uint256 fees,
        uint256 liquidityFee,
        uint256 teamFee,
        uint256 revShareFee,
        uint256 totalFees
    ) private {
        tokensForLiquidity = tokensForLiquidity.add(
            fees.mul(liquidityFee).div(totalFees)
        );
        tokensForTeam = tokensForTeam.add(fees.mul(teamFee).div(totalFees));
        tokensForRevShare = tokensForRevShare.add(
            fees.mul(revShareFee).div(totalFees)
        );
    }

    /**
     * @dev Swaps a specific amount of the contract's tokens for ETH using Uniswap Fork
     */
    function _swapTokensForEth(uint256 tokenAmount) private {
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

        emit SwapForETH(tokenAmount);
    }

    function _addLiquidity(uint256 tokenAmount, uint256 ethAmount) private {
        // approve token transfer to cover all possible scenarios
        _approve(address(this), address(uniswapV2Router), tokenAmount);

        // add the liquidity
        uniswapV2Router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0, // slippage is unavoidable
            0, // slippage is unavoidable
            owner(), // LP tokens sent to owner
            block.timestamp
        );
    }

    function withdrawStuckToken(
        address _token,
        address _to
    ) external onlyOwner {
        require(_token != address(0), "_token address cannot be 0");
        uint256 _contractBalance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).transfer(_to, _contractBalance);
    }

    function withdrawStuckEth(address toAddr) external onlyOwner {
        payable(toAddr).safeTransferETH(address(this).balance);
    }

    function blacklist(address _addr) public onlyOwner {
        require(
            _addr != address(uniswapV2Pair) &&
                _addr != address(uniswapV2Router),
            "Cannot blacklist token's v2 router or v2 pool."
        );
        blacklisted[_addr] = true;
    }

    /// @dev unblacklist address; not affected by blacklistRenounced incase team wants to unblacklist v3 pools down the road
    function unblacklist(address _addr) public onlyOwner {
        blacklisted[_addr] = false;
    }

    /// @dev Set the pre-migration phase to allow for transfers
    function setPreMigrationTransferable(
        address _addr,
        bool isAuthorized
    ) public onlyOwner {
        preMigrationTransferrable[_addr] = isAuthorized;
        excludeFromFees(_addr, isAuthorized);
    }

    function calculateFee(
        uint256 amount,
        uint256 feePercentage
    ) internal pure returns (uint256) {
        return amount.mul(feePercentage).div(FEE_PERCENTAGE_SCALE);
    }

    /// @dev Manual swap back is for emergency use only
    function manualSwapBack() external onlyOwner {
        require(swapEnabled, "Swap is not enabled");
        require(!isSwapInProgress, "Swap is already in progress");
        uint256 contractTokenBalance = balanceOf(address(this));
        require(contractTokenBalance > 0, "No tokens to swap");

        isSwapInProgress = true;
        _swapBack();
        isSwapInProgress = false;
    }

    /// @dev this function is for emergency use only
    function pause() public onlyOwner whenNotPaused {
        paused = true;
        tradingActive = false;
        swapEnabled = false;
        emit Paused(msg.sender);
    }

    /// @dev this function can only be used when the contract is paused
    function unpause() public onlyOwner whenPaused {
        paused = false;
        tradingActive = true;
        swapEnabled = true; 
        emit Unpaused(msg.sender);
    }

    receive() external payable {}
}
