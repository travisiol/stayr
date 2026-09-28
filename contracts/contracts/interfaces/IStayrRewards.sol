// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// How the token classifies a transfer for the vault. A pool is a registered
/// Uniswap v2 pair of the token: tokens leaving a pool are a Buy, tokens
/// entering one are a Sell, everything else is a plain Transfer.
enum TransferKind {
    Transfer,
    Buy,
    Sell
}

/// The only surface the token needs from the vault.
interface IStayrRewards {
    function onTransfer(
        address from,
        address to,
        bool fromEligible,
        bool toEligible,
        TransferKind kind
    ) external;

    function excludeAccount(address account) external;
}
