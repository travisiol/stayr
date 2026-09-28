// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Test-only stand-in for USDG (6 decimals, anyone can mint).
contract MockUSDG is ERC20 {
    constructor() ERC20("Global Dollar (mock)", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Test-only plain ERC-20 used as a third quote asset.
contract MockQuote is ERC20 {
    constructor() ERC20("Quote (mock)", "QUO") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

interface IVaultClaim {
    function claim(uint8 payout, uint256 minUsdgOut, uint256 deadline) external;
}

/// A holder that cannot receive ETH — models a contract wallet whose
/// fallback reverts, i.e. a failed payout.
contract RejectingReceiver {
    function claim(address vault, uint8 payout, uint256 minUsdgOut, uint256 deadline) external {
        IVaultClaim(vault).claim(payout, minUsdgOut, deadline);
    }

    receive() external payable {
        revert("no ETH here");
    }
}

/// A holder that tries to claim again from inside the payout.
contract ReentrantClaimer {
    address public vault;
    uint256 public entered;

    function setVault(address v) external {
        vault = v;
    }

    function claim() external {
        IVaultClaim(vault).claim(0, 0, block.timestamp);
    }

    receive() external payable {
        entered++;
        if (entered == 1) {
            IVaultClaim(vault).claim(0, 0, block.timestamp);
        }
    }
}
