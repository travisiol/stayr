// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {StayrToken} from "./StayrToken.sol";
import {IStayrRewards, TransferKind} from "./interfaces/IStayrRewards.sol";
import {IUniswapV2Pair, IUniswapV2Router02} from "./interfaces/IUniswapV2.sol";

/**
 * @title StayrRewards
 * @notice The STAYR rewards vault. Deploys the token, receives the token-level
 *         trading fee, harvests it to ETH on the token's own Uniswap v2 pool,
 *         accepts direct ETH / USDG deposits, and distributes everything to
 *         eligible holders in proportion to their *time-weighted* balance.
 *
 * ## Weight
 *
 * A holder's weight is `balance × multiplier`. The multiplier depends only on
 * how long the wallet has held without selling: a base multiplier, then three
 * milestones (deployment values: 1 h → 1.5×, 2 h → 2×, 24 h → 3×). Selling or
 * transferring tokens out resets the holding age to zero. Buying more merges
 * the new tokens in at a balance-weighted average age, so a large late purchase
 * cannot inherit a small early position's multiplier.
 *
 * ## Time
 *
 * Time is counted in fixed epochs (deployment value: 60 s). A milestone of
 * `d` epochs for a position started in epoch `s` takes effect at the start of
 * epoch `s + 1 + d` — the first epoch in which the wallet has *provably* held
 * for `d` full epochs. A milestone is therefore credited up to one epoch late,
 * never early.
 *
 * ## Distribution — bounded, non-retroactive
 *
 * Rewards are allocated with a reward-per-weight accumulator: each allocation
 * of `A` at total weight `W` adds `A / W` to `acc`. A holder whose weight is
 * `w` over an interval earns `w × Δacc` for that interval. Because the
 * multiplier steps up at known epochs, a holder's earnings are the sum over
 * at most four intervals (one per tier), each valued at the `acc` in force at
 * its boundary — read from a checkpoint written at every allocation. An
 * allocation is thus split by the weights *in force when it happened*; a
 * wallet crossing a milestone later gets the higher weight only for
 * allocations after the crossing.
 *
 * The total weight changes without transactions as wallets mature, so the
 * vault keeps a schedule of weight increments keyed by epoch (plus a bitmap
 * so empty epochs cost nothing) and rolls it forward before allocating.
 * Every operation is O(1) in the number of holders; the roll-forward is
 * O(elapsed epochs / 256) and can be advanced in slices by anyone (`sync`).
 * Allocations only happen when the roll-forward is complete; until then new
 * funds simply wait, unallocated, in the vault.
 *
 * ## Assets
 *
 * Two ledgers, ETH and USDG, share the same weights. Claims pay ETH and USDG
 * as accrued, or swap the ETH part to USDG on the Uniswap v2 WETH/USDG pool
 * at claim time with a caller-supplied minimum. Nothing here is a fiat
 * withdrawal.
 *
 * ## No owner
 *
 * There is no owner, admin, upgrade path, sweep, pause or parameter setter.
 * Every address the vault talks to is immutable. What remains is listed in
 * ECONOMICS.md and README.md ("Remaining permissions and dependencies").
 */
contract StayrRewards is IStayrRewards, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------ types

    struct Params {
        string name;
        string symbol;
        uint256 supply;
        address supplyRecipient;
        address factory;
        address router;
        address weth;
        address usdg;
        uint16 feeBps;
        uint32 epochSeconds;
        uint16 baseMultiplierBps;
        uint32[3] milestoneEpochs;
        uint16[3] milestoneMultiplierBps;
        uint16 harvestCapBps;
        uint32 harvestCooldown;
        bool forfeitPendingOnSale;
    }

    enum Payout {
        ETH,
        USDG
    }

    enum Change {
        Purchase,
        Sale,
        TransferIn,
        TransferOut,
        Excluded,
        Settled
    }

    struct Checkpoint {
        uint64 epoch;
        uint256 accEth;
        uint256 accUsdg;
    }

    struct Holder {
        uint256 balance;
        uint64 startEpoch; // effective start of the position
        uint64 sinceEpoch; // epoch of the last settlement (acc snapshots below)
        uint256 accEthStart;
        uint256 accUsdgStart;
        uint256 pendingEth; // settled, claimable
        uint256 pendingUsdg;
    }

    struct HolderView {
        uint256 balance;
        uint64 startEpoch;
        uint64 sinceEpoch;
        uint8 tier;
        uint16 multiplierBps;
        uint256 weight;
        uint256 claimableEth;
        uint256 claimableUsdg;
        uint64 nextMilestoneEpoch; // 0 at the top tier
        uint16 nextMultiplierBps;
    }

    struct Config {
        uint64 genesis;
        uint32 epochSeconds;
        uint16 feeBps;
        uint16 baseMultiplierBps;
        uint32[3] milestoneEpochs;
        uint16[3] milestoneMultiplierBps;
        uint16 harvestCapBps;
        uint32 harvestCooldown;
        bool forfeitPendingOnSale;
    }

    struct Stats {
        uint64 currentEpoch;
        uint64 syncedEpoch;
        uint256 totalWeightSynced;
        uint256 totalWeightNow;
        bool weightNowExact;
        uint256 unallocatedEth;
        uint256 unallocatedUsdg;
        uint256 outstandingEth;
        uint256 outstandingUsdg;
        uint256 totalEthAllocated;
        uint256 totalUsdgAllocated;
        uint256 totalEthClaimed;
        uint256 totalUsdgClaimed;
        uint256 checkpointCount;
        uint256 tokenFeeBalance;
        uint64 lastHarvestAt;
        uint64 harvestReadyAt;
    }

    // -------------------------------------------------------- constants

    uint256 public constant BPS = 10_000;
    /// Weights already carry the ×10 000 multiplier scale, so `acc` is
    /// "wei per (token-wei × bps)" and earning divides by this alone.
    uint256 private constant ACC_PRECISION = 1e30;
    uint256 private constant EARN_DENOM = ACC_PRECISION;
    /// Roll-forward budget (bitmap words of 256 epochs) spent by a transfer
    /// or a claim before giving up on allocating this time.
    uint256 public constant SYNC_WORDS_PER_TOUCH = 16;
    uint256 private constant VIEW_SYNC_WORDS = 4096;

    // ------------------------------------------------------- immutables

    StayrToken public immutable token;
    IUniswapV2Router02 public immutable router;
    address public immutable weth;
    IERC20 public immutable usdg;
    uint64 public immutable genesis;
    uint32 public immutable epochSeconds;
    uint16 public immutable feeBps;
    uint16 public immutable baseMultiplierBps;
    uint32 private immutable _m1Epochs;
    uint32 private immutable _m2Epochs;
    uint32 private immutable _m3Epochs;
    uint16 private immutable _m1Bps;
    uint16 private immutable _m2Bps;
    uint16 private immutable _m3Bps;
    uint16 public immutable harvestCapBps;
    uint32 public immutable harvestCooldown;
    bool public immutable forfeitPendingOnSale;

    // ---------------------------------------------------------- storage

    uint256 public totalWeight; // as of syncedEpoch
    uint64 public syncedEpoch;
    mapping(uint256 => uint256) private _scheduled; // epoch => weight increment
    mapping(uint256 => uint256) private _scheduledBitmap; // epoch >> 8 => bits

    Checkpoint[] private _checkpoints;
    uint256 public accEthPerWeight;
    uint256 public accUsdgPerWeight;
    uint256 public outstandingEth; // allocated, not yet claimed
    uint256 public outstandingUsdg;
    uint256 public totalEthAllocated;
    uint256 public totalUsdgAllocated;
    uint256 public totalEthClaimed;
    uint256 public totalUsdgClaimed;
    uint64 public lastHarvestAt;

    mapping(address => Holder) private _holders;

    // ----------------------------------------------------------- events

    event EthReceived(address indexed from, uint256 amount);
    event UsdgDeposited(address indexed from, uint256 amount);
    event Synced(uint64 toEpoch, uint256 totalWeight, bool complete);
    event Allocated(uint64 indexed epoch, uint256 ethAmount, uint256 usdgAmount, uint256 totalWeight);
    event Harvested(address indexed caller, uint256 tokensSold, uint256 ethReceived);
    event Claimed(
        address indexed account,
        Payout payout,
        uint256 ethAmount,
        uint256 usdgAmount,
        uint256 ethSwapped,
        uint256 usdgReceived
    );
    event PositionChanged(
        address indexed account,
        Change change,
        uint256 balance,
        uint64 startEpoch,
        uint16 multiplierBps
    );
    event Forfeited(address indexed account, uint256 ethAmount, uint256 usdgAmount);

    error OnlyToken();
    error InvalidParams();
    error NothingToClaim();
    error EthTransferFailed();
    error Expired();
    error HarvestNotReady(uint64 readyAt);
    error NoPool();
    error NothingToHarvest();

    // ------------------------------------------------------ constructor

    constructor(Params memory p) {
        if (
            p.router == address(0) || p.factory == address(0) || p.weth == address(0) || p.usdg == address(0) ||
            p.epochSeconds == 0 || p.harvestCapBps == 0 || p.harvestCapBps > 500 || p.baseMultiplierBps > BPS ||
            p.milestoneEpochs[0] == 0 || p.milestoneEpochs[1] <= p.milestoneEpochs[0] ||
            p.milestoneEpochs[2] <= p.milestoneEpochs[1] || p.milestoneMultiplierBps[0] <= p.baseMultiplierBps ||
            p.milestoneMultiplierBps[1] <= p.milestoneMultiplierBps[0] ||
            p.milestoneMultiplierBps[2] <= p.milestoneMultiplierBps[1] || p.milestoneMultiplierBps[2] > 100 * BPS
        ) revert InvalidParams();
        if (IUniswapV2Router02(p.router).factory() != p.factory || IUniswapV2Router02(p.router).WETH() != p.weth) {
            revert InvalidParams();
        }

        router = IUniswapV2Router02(p.router);
        weth = p.weth;
        usdg = IERC20(p.usdg);
        genesis = uint64(block.timestamp);
        epochSeconds = p.epochSeconds;
        feeBps = p.feeBps;
        baseMultiplierBps = p.baseMultiplierBps;
        _m1Epochs = p.milestoneEpochs[0];
        _m2Epochs = p.milestoneEpochs[1];
        _m3Epochs = p.milestoneEpochs[2];
        _m1Bps = p.milestoneMultiplierBps[0];
        _m2Bps = p.milestoneMultiplierBps[1];
        _m3Bps = p.milestoneMultiplierBps[2];
        harvestCapBps = p.harvestCapBps;
        harvestCooldown = p.harvestCooldown;
        forfeitPendingOnSale = p.forfeitPendingOnSale;

        token = new StayrToken(p.name, p.symbol, p.supply, p.supplyRecipient, p.factory, p.weth, p.usdg, p.feeBps);
        // The token minted its supply while this contract had no code yet, so
        // it could not report the mint. Register the initial holder here.
        _apply(p.supplyRecipient, p.supply, true, Change.Purchase);
    }

    // ------------------------------------------------------- deposits

    /// ETH from the harvest, from a Pons-style fee recipient payout, or from
    /// anyone. Allocated at the next touch (transfer, claim, `allocate`).
    receive() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    /// USDG from anyone. Pulled, then allocated in the same call when possible.
    function depositUsdg(uint256 amount) external nonReentrant {
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        emit UsdgDeposited(msg.sender, amount);
        _allocate(SYNC_WORDS_PER_TOUCH);
    }

    // ---------------------------------------------------- token hooks

    /// @inheritdoc IStayrRewards
    function onTransfer(address from, address to, bool fromEligible, bool toEligible, TransferKind kind)
        external
        override
    {
        if (msg.sender != address(token)) revert OnlyToken();
        // Allocate what has arrived *before* the balances move, so a wallet
        // cannot buy into funds that accrued while it held nothing.
        _allocate(SYNC_WORDS_PER_TOUCH);
        _apply(from, token.balanceOf(from), fromEligible, kind == TransferKind.Sell ? Change.Sale : Change.TransferOut);
        _apply(to, token.balanceOf(to), toEligible, kind == TransferKind.Buy ? Change.Purchase : Change.TransferIn);
    }

    /// @inheritdoc IStayrRewards
    function excludeAccount(address account) external override {
        if (msg.sender != address(token)) revert OnlyToken();
        _apply(account, token.balanceOf(account), false, Change.Excluded);
    }

    // ------------------------------------------------------- keepers

    /// Advances the weight schedule by up to `maxWords` × 256 epochs.
    function sync(uint256 maxWords) external returns (bool complete) {
        return _sync(maxWords);
    }

    /// Allocates any unallocated ETH / USDG to current weights (if synced).
    function allocate() external nonReentrant returns (bool allocated) {
        return _allocate(VIEW_SYNC_WORDS);
    }

    /**
     * Sells collected fee tokens for ETH on the STAYR/WETH pool. Anyone can
     * call it. Two bounds replace a slippage parameter: at most
     * `harvestCapBps` of the pool's STAYR reserve per call, and one call per
     * `harvestCooldown`. Moving the price against a sale that small costs a
     * sandwicher more in pool fees than it can take back, so `amountOutMin`
     * is 0 by design — see ECONOMICS.md.
     */
    function harvest() external nonReentrant returns (uint256 tokensSold, uint256 ethReceived) {
        uint64 readyAt = lastHarvestAt + harvestCooldown;
        if (block.timestamp < readyAt) revert HarvestNotReady(readyAt);
        (uint256 amount, , ) = harvestable();
        if (amount == 0) revert NothingToHarvest();

        lastHarvestAt = uint64(block.timestamp);
        IERC20(address(token)).forceApprove(address(router), amount);
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = weth;
        uint256 before = address(this).balance;
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(amount, 0, path, address(this), block.timestamp);
        ethReceived = address(this).balance - before;
        tokensSold = amount;
        emit Harvested(msg.sender, amount, ethReceived);
        _allocate(SYNC_WORDS_PER_TOUCH);
    }

    // -------------------------------------------------------- claims

    /**
     * Pays the caller everything settled so far. `Payout.ETH` sends ETH and
     * any USDG as accrued. `Payout.USDG` swaps the ETH part to USDG on the
     * WETH/USDG pool (at least `minUsdgOut`, by `deadline`) and sends it with
     * any USDG accrued. Reverts if there is nothing to pay.
     */
    function claim(Payout payout, uint256 minUsdgOut, uint256 deadline) external nonReentrant {
        _allocate(SYNC_WORDS_PER_TOUCH);
        Holder storage h = _holders[msg.sender];
        _settle(msg.sender, h);

        uint256 eth = h.pendingEth;
        uint256 usd = h.pendingUsdg;
        if (eth == 0 && usd == 0) revert NothingToClaim();
        h.pendingEth = 0;
        h.pendingUsdg = 0;
        outstandingEth -= eth;
        outstandingUsdg -= usd;
        totalEthClaimed += eth;
        totalUsdgClaimed += usd;

        uint256 swapped;
        uint256 received;
        if (eth != 0) {
            if (payout == Payout.USDG) {
                if (deadline < block.timestamp) revert Expired();
                address[] memory path = new address[](2);
                path[0] = weth;
                path[1] = address(usdg);
                uint256[] memory amounts = router.swapExactETHForTokens{value: eth}(minUsdgOut, path, msg.sender, deadline);
                swapped = eth;
                received = amounts[1];
            } else {
                (bool ok, ) = msg.sender.call{value: eth}("");
                if (!ok) revert EthTransferFailed();
            }
        }
        if (usd != 0) usdg.safeTransfer(msg.sender, usd);
        emit Claimed(msg.sender, payout, eth, usd, swapped, received);
    }

    // --------------------------------------------------------- views

    function currentEpoch() public view returns (uint64) {
        return uint64((block.timestamp - genesis) / epochSeconds);
    }

    function epochStart(uint256 epoch) public view returns (uint256) {
        return genesis + epoch * epochSeconds;
    }

    function config() external view returns (Config memory c) {
        c.genesis = genesis;
        c.epochSeconds = epochSeconds;
        c.feeBps = feeBps;
        c.baseMultiplierBps = baseMultiplierBps;
        c.milestoneEpochs = [_m1Epochs, _m2Epochs, _m3Epochs];
        c.milestoneMultiplierBps = [_m1Bps, _m2Bps, _m3Bps];
        c.harvestCapBps = harvestCapBps;
        c.harvestCooldown = harvestCooldown;
        c.forfeitPendingOnSale = forfeitPendingOnSale;
    }

    function holderOf(address account) external view returns (HolderView memory v) {
        Holder storage h = _holders[account];
        uint64 c = currentEpoch();
        v.balance = h.balance;
        v.startEpoch = h.startEpoch;
        v.sinceEpoch = h.sinceEpoch;
        (uint256 m, uint256 tier) = _multiplierAt(c, h.startEpoch);
        v.tier = uint8(tier);
        v.multiplierBps = uint16(m);
        v.weight = h.balance * m;
        (uint256 e, uint256 u) = _earned(h, c);
        v.claimableEth = h.pendingEth + e;
        v.claimableUsdg = h.pendingUsdg + u;
        if (h.balance != 0 && tier < 3) {
            v.nextMilestoneEpoch = uint64(h.startEpoch + 1 + _milestoneEpochs(tier + 1));
            v.nextMultiplierBps = uint16(_multiplierBps(tier + 1));
        }
    }

    function stats() external view returns (Stats memory s) {
        s.currentEpoch = currentEpoch();
        s.syncedEpoch = syncedEpoch;
        s.totalWeightSynced = totalWeight;
        (s.totalWeightNow, , s.weightNowExact) = _rollForward(syncedEpoch, s.currentEpoch, totalWeight, VIEW_SYNC_WORDS);
        s.unallocatedEth = address(this).balance - outstandingEth;
        s.unallocatedUsdg = usdg.balanceOf(address(this)) - outstandingUsdg;
        s.outstandingEth = outstandingEth;
        s.outstandingUsdg = outstandingUsdg;
        s.totalEthAllocated = totalEthAllocated;
        s.totalUsdgAllocated = totalUsdgAllocated;
        s.totalEthClaimed = totalEthClaimed;
        s.totalUsdgClaimed = totalUsdgClaimed;
        s.checkpointCount = _checkpoints.length;
        s.tokenFeeBalance = token.balanceOf(address(this));
        s.lastHarvestAt = lastHarvestAt;
        s.harvestReadyAt = lastHarvestAt + harvestCooldown;
    }

    /// Fee tokens that the next `harvest` would sell, the current cap, and when it may run.
    function harvestable() public view returns (uint256 amount, uint256 cap, uint64 readyAt) {
        readyAt = lastHarvestAt + harvestCooldown;
        address pair = token.wethPair();
        if (pair == address(0)) return (0, 0, readyAt);
        (uint112 r0, uint112 r1, ) = IUniswapV2Pair(pair).getReserves();
        uint256 reserveToken = IUniswapV2Pair(pair).token0() == address(token) ? r0 : r1;
        cap = (reserveToken * harvestCapBps) / BPS;
        uint256 have = token.balanceOf(address(this));
        amount = have < cap ? have : cap;
    }

    function checkpointCount() external view returns (uint256) {
        return _checkpoints.length;
    }

    function checkpointAt(uint256 index) external view returns (Checkpoint memory) {
        return _checkpoints[index];
    }

    /// Multiplier (bps) and tier index a position started in `startEpoch` has during `epoch`.
    function multiplierAt(uint256 epoch, uint256 startEpoch) external view returns (uint16, uint8) {
        (uint256 m, uint256 t) = _multiplierAt(epoch, startEpoch);
        return (uint16(m), uint8(t));
    }

    // ------------------------------------------------------ internals

    function _milestoneEpochs(uint256 k) private view returns (uint256) {
        return k == 1 ? _m1Epochs : k == 2 ? _m2Epochs : _m3Epochs;
    }

    function _multiplierBps(uint256 k) private view returns (uint256) {
        return k == 0 ? baseMultiplierBps : k == 1 ? _m1Bps : k == 2 ? _m2Bps : _m3Bps;
    }

    function _multiplierAt(uint256 epoch, uint256 startEpoch) private view returns (uint256 mult, uint256 tier) {
        if (epoch >= startEpoch + 1 + _m3Epochs) return (_m3Bps, 3);
        if (epoch >= startEpoch + 1 + _m2Epochs) return (_m2Bps, 2);
        if (epoch >= startEpoch + 1 + _m1Epochs) return (_m1Bps, 1);
        return (baseMultiplierBps, 0);
    }

    /**
     * Rolls the total weight forward from `from` (exclusive) to `to`
     * (inclusive) by applying scheduled milestone increments, skipping empty
     * 256-epoch words. Stops after `maxWords` words: `reached` is then the
     * last epoch applied and `complete` is false.
     */
    function _rollForward(uint256 from, uint256 to, uint256 weight, uint256 maxWords)
        private
        view
        returns (uint256 newWeight, uint256 reached, bool complete)
    {
        if (from >= to) return (weight, from, true);
        uint256 e = from + 1;
        uint256 words;
        while (e <= to) {
            if (words == maxWords) return (weight, e - 1, false);
            words++;
            uint256 wi = e >> 8;
            uint256 word = _scheduledBitmap[wi];
            if (word != 0) {
                word &= ~uint256(0) << (e & 255);
                if (((wi << 8) | 255) > to) {
                    uint256 hiBits = (to & 255) + 1;
                    word &= (uint256(1) << hiBits) - 1;
                }
                while (word != 0) {
                    uint256 low = word & (~word + 1);
                    weight += _scheduled[(wi << 8) | Math.log2(low)];
                    word ^= low;
                }
            }
            e = (wi + 1) << 8;
        }
        return (weight, to, true);
    }

    function _sync(uint256 maxWords) private returns (bool complete) {
        uint256 c = currentEpoch();
        uint256 s = syncedEpoch;
        if (s >= c) return true;
        uint256 w;
        uint256 reached;
        (w, reached, complete) = _rollForward(s, c, totalWeight, maxWords);
        if (reached != s) {
            totalWeight = w;
            syncedEpoch = uint64(reached);
            emit Synced(uint64(reached), w, complete);
        }
    }

    /// Allocates unallocated balances to the current total weight if the
    /// schedule can be brought up to date within `maxWords`.
    function _allocate(uint256 maxWords) private returns (bool allocated) {
        if (!_sync(maxWords)) return false;
        uint256 w = totalWeight;
        if (w == 0) return false;
        uint256 ethAvail = address(this).balance - outstandingEth;
        uint256 usdAvail = usdg.balanceOf(address(this)) - outstandingUsdg;
        if (ethAvail == 0 && usdAvail == 0) return false;
        if (ethAvail != 0) {
            accEthPerWeight += Math.mulDiv(ethAvail, ACC_PRECISION, w);
            outstandingEth += ethAvail;
            totalEthAllocated += ethAvail;
        }
        if (usdAvail != 0) {
            accUsdgPerWeight += Math.mulDiv(usdAvail, ACC_PRECISION, w);
            outstandingUsdg += usdAvail;
            totalUsdgAllocated += usdAvail;
        }
        uint64 epoch = syncedEpoch;
        _checkpoints.push(Checkpoint(epoch, accEthPerWeight, accUsdgPerWeight));
        emit Allocated(epoch, ethAvail, usdAvail, w);
        return true;
    }

    /// `acc` in force at the start of `epoch`: the last checkpoint written in
    /// an earlier epoch.
    function _accBefore(uint256 epoch) private view returns (uint256 accEth, uint256 accUsdg) {
        uint256 lo = 0;
        uint256 hi = _checkpoints.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) >> 1;
            if (_checkpoints[mid].epoch < epoch) lo = mid + 1;
            else hi = mid;
        }
        if (lo == 0) return (0, 0);
        Checkpoint storage cp = _checkpoints[lo - 1];
        return (cp.accEth, cp.accUsdg);
    }

    /// Rewards earned by `h` since its last settlement, tier by tier.
    function _earned(Holder storage h, uint256 c) private view returns (uint256 eth, uint256 usd) {
        uint256 b = h.balance;
        if (b == 0) return (0, 0);
        (uint256 m, uint256 tier) = _multiplierAt(h.sinceEpoch, h.startEpoch);
        uint256 prevE = h.accEthStart;
        uint256 prevU = h.accUsdgStart;
        for (uint256 k = tier + 1; k <= 3; k++) {
            uint256 at = h.startEpoch + 1 + _milestoneEpochs(k);
            if (at > c) break;
            (uint256 aE, uint256 aU) = _accBefore(at);
            if (aE > prevE) eth += Math.mulDiv(b * m, aE - prevE, EARN_DENOM);
            if (aU > prevU) usd += Math.mulDiv(b * m, aU - prevU, EARN_DENOM);
            if (aE > prevE) prevE = aE;
            if (aU > prevU) prevU = aU;
            m = _multiplierBps(k);
        }
        eth += Math.mulDiv(b * m, accEthPerWeight - prevE, EARN_DENOM);
        usd += Math.mulDiv(b * m, accUsdgPerWeight - prevU, EARN_DENOM);
    }

    function _settle(address account, Holder storage h) private {
        uint64 c = currentEpoch();
        if (h.balance != 0) {
            (uint256 e, uint256 u) = _earned(h, c);
            h.pendingEth += e;
            h.pendingUsdg += u;
        }
        h.sinceEpoch = c;
        h.accEthStart = accEthPerWeight;
        h.accUsdgStart = accUsdgPerWeight;
        (uint256 m, ) = _multiplierAt(c, h.startEpoch);
        emit PositionChanged(account, Change.Settled, h.balance, h.startEpoch, uint16(m));
    }

    /// Adds `b × multiplier` to the total weight as of the synced epoch and
    /// schedules the increments of the milestones still ahead.
    function _addWeight(uint256 b, uint256 start) private {
        uint256 s = syncedEpoch;
        (uint256 m, uint256 tier) = _multiplierAt(s, start);
        totalWeight += b * m;
        uint256 prev = m;
        for (uint256 k = tier + 1; k <= 3; k++) {
            uint256 at = start + 1 + _milestoneEpochs(k);
            uint256 mk = _multiplierBps(k);
            _scheduled[at] += b * (mk - prev);
            _scheduledBitmap[at >> 8] |= uint256(1) << (at & 255);
            prev = mk;
        }
    }

    /// Exact inverse of `_addWeight` for the same (b, start). Saturating, so
    /// an accounting fault can never freeze token transfers.
    function _removeWeight(uint256 b, uint256 start) private {
        uint256 s = syncedEpoch;
        (uint256 m, uint256 tier) = _multiplierAt(s, start);
        uint256 w = b * m;
        totalWeight = totalWeight > w ? totalWeight - w : 0;
        uint256 prev = m;
        for (uint256 k = tier + 1; k <= 3; k++) {
            uint256 at = start + 1 + _milestoneEpochs(k);
            uint256 mk = _multiplierBps(k);
            uint256 inc = b * (mk - prev);
            uint256 cur = _scheduled[at];
            _scheduled[at] = cur > inc ? cur - inc : 0;
            prev = mk;
        }
    }

    function _forfeit(address account, Holder storage h) private {
        uint256 e = h.pendingEth;
        uint256 u = h.pendingUsdg;
        if (e == 0 && u == 0) return;
        h.pendingEth = 0;
        h.pendingUsdg = 0;
        // Back to the unallocated pool: the next allocation redistributes it.
        outstandingEth -= e;
        outstandingUsdg -= u;
        emit Forfeited(account, e, u);
    }

    /**
     * Applies a balance change. Settles what the old position earned, removes
     * its weight, decides the new position's start and adds its weight.
     *
     *   decrease (sale / transfer out)  → holding age resets to now
     *   increase from zero              → starts now
     *   increase on an open position    → balance-weighted average start
     *   ineligible account              → no position, pending forfeited
     */
    function _apply(address account, uint256 newBalance, bool eligible, Change change) private {
        Holder storage h = _holders[account];
        uint256 old = h.balance;
        if (old == 0 && (newBalance == 0 || !eligible)) return;

        uint64 c = currentEpoch();
        if (old != 0) {
            (uint256 e, uint256 u) = _earned(h, c);
            h.pendingEth += e;
            h.pendingUsdg += u;
            _removeWeight(old, h.startEpoch);
        }

        if (!eligible || newBalance == 0) {
            if (!eligible) _forfeit(account, h);
            else if (forfeitPendingOnSale && newBalance < old) _forfeit(account, h);
            h.balance = 0;
            h.startEpoch = 0;
            h.sinceEpoch = c;
            h.accEthStart = accEthPerWeight;
            h.accUsdgStart = accUsdgPerWeight;
            emit PositionChanged(account, change, 0, 0, 0);
            return;
        }

        uint64 start;
        if (old == 0) {
            start = c;
        } else if (newBalance < old) {
            start = c;
            if (forfeitPendingOnSale) _forfeit(account, h);
        } else {
            uint256 added = newBalance - old;
            // ceil: rounding the start later is the conservative direction
            start = uint64((old * h.startEpoch + added * c + newBalance - 1) / newBalance);
        }

        _addWeight(newBalance, start);
        h.balance = newBalance;
        h.startEpoch = start;
        h.sinceEpoch = c;
        h.accEthStart = accEthPerWeight;
        h.accUsdgStart = accUsdgPerWeight;
        (uint256 m, ) = _multiplierAt(c, start);
        emit PositionChanged(account, change, newBalance, start, uint16(m));
    }
}
