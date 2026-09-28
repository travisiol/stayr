import { ethers } from "hardhat";
import type { Signer } from "ethers";
import FactoryArtifact from "@uniswap/v2-core/build/UniswapV2Factory.json";
import RouterArtifact from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import WethArtifact from "@uniswap/v2-periphery/build/WETH9.json";

export const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint amountToken,uint amountETH,uint liquidity)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin,address[] path,address to,uint deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline)",
  "function getAmountsOut(uint amountIn,address[] path) view returns (uint[] amounts)",
];

export const FAR_DEADLINE = 4_102_444_800; // 2100-01-01

/**
 * Deploys a private Uniswap v2 (the published mainnet build artifacts) plus
 * a mock USDG on a local network. Never used against Robinhood Chain, where
 * the real, verified addresses are passed in instead.
 */
export async function deployLocalVenue(deployer: Signer) {
  const weth = await new ethers.ContractFactory(WethArtifact.abi, WethArtifact.bytecode, deployer).deploy();
  await weth.waitForDeployment();
  const factory = await new ethers.ContractFactory(FactoryArtifact.abi, FactoryArtifact.bytecode, deployer).deploy(
    await deployer.getAddress(),
  );
  await factory.waitForDeployment();
  const router = await new ethers.ContractFactory(RouterArtifact.abi, RouterArtifact.bytecode, deployer).deploy(
    await factory.getAddress(),
    await weth.getAddress(),
  );
  await router.waitForDeployment();
  const usdg = await (await ethers.getContractFactory("MockUSDG", deployer)).deploy();
  await usdg.waitForDeployment();
  return {
    weth: await weth.getAddress(),
    factory: await factory.getAddress(),
    router: await router.getAddress(),
    usdg: await usdg.getAddress(),
    usdgContract: usdg,
  };
}

export function routerAt(address: string, runner: Signer) {
  return new ethers.Contract(address, ROUTER_ABI, runner);
}

/** Deployment parameters — the local/testnet assumptions listed in ECONOMICS.md. */
export function stayrParams(venue: { factory: string; router: string; weth: string; usdg: string }, supplyRecipient: string) {
  return {
    name: "STAYR",
    symbol: "STAYR",
    supply: ethers.parseEther("1000000000"),
    supplyRecipient,
    factory: venue.factory,
    router: venue.router,
    weth: venue.weth,
    usdg: venue.usdg,
    feeBps: Number(process.env.STAYR_FEE_BPS ?? 200),
    epochSeconds: Number(process.env.STAYR_EPOCH_SECONDS ?? 60),
    baseMultiplierBps: Number(process.env.STAYR_BASE_MULTIPLIER_BPS ?? 10_000),
    milestoneEpochs: [60, 120, 1440] as [number, number, number],
    milestoneMultiplierBps: [15_000, 20_000, 30_000] as [number, number, number],
    harvestCapBps: Number(process.env.STAYR_HARVEST_CAP_BPS ?? 50),
    harvestCooldown: Number(process.env.STAYR_HARVEST_COOLDOWN ?? 600),
    forfeitPendingOnSale: process.env.STAYR_FORFEIT_ON_SALE === "true",
  };
}
