// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IUniswapV2Factory} from "./interfaces/IUniswapV2.sol";
import {IStayrRewards, TransferKind} from "./interfaces/IStayrRewards.sol";

/**
 * @title StayrToken
 * @notice The STAYR ERC-20. Two jobs beyond a plain token, both done inside
 *         `_update` so nothing off-chain is ever the authority:
 *
 *  1. Fee collection. An ERC-20 has no way to charge a trading venue, so the
 *     fee is charged at the token level: whenever tokens move between a
 *     holder and one of the token's own Uniswap v2 pools, `feeBps` of the
 *     amount is redirected to the rewards vault. Plain wallet-to-wallet
 *     transfers are not charged. This is the *only* fee STAYR collects —
 *     the pool's own 0.30% LP fee, aggregator fees and network gas are paid
 *     to other parties and never reach holders.
 *
 *  2. Holder accounting. After every transfer the vault is told who moved
 *     what, with the transfer classified as a buy, a sell or a transfer, so
 *     it can update holding ages and reward weights. The call must succeed:
 *     a transfer whose accounting fails reverts, otherwise a seller could
 *     dodge the age reset by starving the vault of gas.
 *
 *  Pools are discovered, not administered: the factory is queried for the
 *  STAYR/WETH and STAYR/USDG pairs and the result is cached the first time
 *  it exists. Any other Uniswap v2 pair of STAYR can be registered by anyone
 *  through `registerPair`, which only accepts what the factory itself reports.
 *
 *  No owner, no minting after construction, no burn, no pause, no
 *  blacklist, no fee changes. The vault is the only exempt address (its
 *  harvest sales would otherwise pay a fee to itself).
 */
contract StayrToken is ERC20 {
    uint256 public constant BPS = 10_000;

    IStayrRewards public immutable rewards;
    IUniswapV2Factory public immutable factory;
    address public immutable weth;
    address public immutable usdg;
    /// Fee charged on pool trades, in basis points of the traded amount.
    uint16 public immutable feeBps;

    address private _wethPair;
    address private _usdgPair;
    /// Registered pools: excluded from rewards, trades against them are charged.
    mapping(address => bool) public isPool;

    event PoolRegistered(address indexed pool, address indexed quote);
    event FeeCollected(address indexed payer, address indexed pool, uint256 amount, TransferKind kind);

    error InvalidFee();
    error ZeroAddress();
    error NoSuchPair();
    error AlreadyRegistered();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply,
        address supplyRecipient,
        address factory_,
        address weth_,
        address usdg_,
        uint16 feeBps_
    ) ERC20(name_, symbol_) {
        if (feeBps_ > 1_000) revert InvalidFee(); // never more than 10%
        if (supplyRecipient == address(0) || factory_ == address(0) || weth_ == address(0) || usdg_ == address(0)) {
            revert ZeroAddress();
        }
        rewards = IStayrRewards(msg.sender);
        factory = IUniswapV2Factory(factory_);
        weth = weth_;
        usdg = usdg_;
        feeBps = feeBps_;
        _mint(supplyRecipient, supply);
    }

    // ------------------------------------------------------------ pools

    /// The STAYR/WETH pair, cached or looked up.
    function wethPair() public view returns (address) {
        return _wethPair != address(0) ? _wethPair : factory.getPair(address(this), weth);
    }

    /// The STAYR/USDG pair, cached or looked up.
    function usdgPair() public view returns (address) {
        return _usdgPair != address(0) ? _usdgPair : factory.getPair(address(this), usdg);
    }

    /**
     * Registers an additional Uniswap v2 pair of STAYR (any quote asset) as a
     * pool. Permissionless and verifiable: the address comes from the
     * factory, never from the caller. The pool stops earning rewards and
     * trades against it are charged from then on.
     */
    function registerPair(address quote) external returns (address pair) {
        pair = factory.getPair(address(this), quote);
        if (pair == address(0)) revert NoSuchPair();
        if (isPool[pair]) revert AlreadyRegistered();
        isPool[pair] = true;
        emit PoolRegistered(pair, quote);
        rewards.excludeAccount(pair);
    }

    /// Whether `account` can earn rewards: not a pool, not the vault, not this.
    function isEligible(address account) public view returns (bool) {
        return !isPool[account] && account != address(rewards) && account != address(this) && account != address(0);
    }

    function _pool(address account) private returns (bool) {
        if (isPool[account]) return true;
        if (_wethPair == address(0)) {
            address p = factory.getPair(address(this), weth);
            if (p != address(0)) {
                _wethPair = p;
                isPool[p] = true;
                emit PoolRegistered(p, weth);
                if (p == account) return true;
            }
        }
        if (_usdgPair == address(0)) {
            address p = factory.getPair(address(this), usdg);
            if (p != address(0)) {
                _usdgPair = p;
                isPool[p] = true;
                emit PoolRegistered(p, usdg);
                if (p == account) return true;
            }
        }
        return false;
    }

    // --------------------------------------------------------- transfers

    function _update(address from, address to, uint256 value) internal override {
        // The only mint is in the constructor and there is no burn path, so
        // the zero-address branch never reaches the vault.
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        bool fromPool = _pool(from);
        bool toPool = _pool(to);
        TransferKind kind = fromPool == toPool
            ? TransferKind.Transfer
            : (fromPool ? TransferKind.Buy : TransferKind.Sell);

        uint256 fee;
        if (kind != TransferKind.Transfer && from != address(rewards) && to != address(rewards)) {
            fee = (value * feeBps) / BPS;
        }
        if (fee != 0) {
            super._update(from, address(rewards), fee);
            emit FeeCollected(kind == TransferKind.Buy ? to : from, kind == TransferKind.Buy ? from : to, fee, kind);
        }
        super._update(from, to, value - fee);

        if (from != to && value != 0) {
            rewards.onTransfer(from, to, _eligible(from, fromPool), _eligible(to, toPool), kind);
        }
    }

    function _eligible(address account, bool pool) private view returns (bool) {
        return !pool && account != address(rewards) && account != address(this);
    }
}
