// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Minimal Uniswap v2 surface used by STAYR. Robinhood Chain deployment
/// (verified on chain 2026-09-28 — router.factory() and router.WETH() match):
///   factory  0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f
///   router02 0x89e5db8b5aa49aa85ac63f691524311aeb649eba
///   WETH     0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

interface IUniswapV2Router02 {
    function factory() external view returns (address);
    function WETH() external view returns (address);

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}
