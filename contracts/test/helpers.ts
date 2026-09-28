import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { ContractRunner, Signer } from "ethers";
import FactoryArtifact from "@uniswap/v2-core/build/UniswapV2Factory.json";
import RouterArtifact from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import WethArtifact from "@uniswap/v2-periphery/build/WETH9.json";
import type { StayrRewards, StayrToken, MockUSDG } from "../typechain-types";

export const HOUR = 60 * 60;
export const DAY = 24 * HOUR;
export const EPOCH = 60;
export const BPS = 10_000n;
export const SUPPLY = ethers.parseEther("1000000000"); // 1e9 STAYR
export const FEE_BPS = 200; // 2% on pool trades — local assumption, see ECONOMICS.md
export const DEADLINE = () => Math.floor(Date.now() / 1000) + 10 * 365 * DAY;

const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint amountToken,uint amountETH,uint liquidity)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin,address[] path,address to,uint deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline)",
  "function swapExactETHForTokens(uint amountOutMin,address[] path,address to,uint deadline) payable returns (uint[] amounts)",
  "function getAmountsOut(uint amountIn,address[] path) view returns (uint[] amounts)",
];
const FACTORY_ABI = [
  "function getPair(address,address) view returns (address)",
  "function createPair(address,address) returns (address)",
  "function allPairsLength() view returns (uint)",
];
const PAIR_ABI = [
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function balanceOf(address) view returns (uint)",
];

export function defaultParams(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "STAYR",
    symbol: "STAYR",
    supply: SUPPLY,
    supplyRecipient: ethers.ZeroAddress, // filled by the fixture
    factory: ethers.ZeroAddress,
    router: ethers.ZeroAddress,
    weth: ethers.ZeroAddress,
    usdg: ethers.ZeroAddress,
    feeBps: FEE_BPS,
    epochSeconds: EPOCH,
    baseMultiplierBps: 10_000,
    milestoneEpochs: [60, 120, 1440] as [number, number, number],
    milestoneMultiplierBps: [15_000, 20_000, 30_000] as [number, number, number],
    harvestCapBps: 50,
    harvestCooldown: 10 * 60,
    forfeitPendingOnSale: false,
    ...overrides,
  };
}

/**
 * Real Uniswap v2 (factory, router, WETH9 from the published build
 * artifacts — the same bytecode as mainnet), a mock USDG, and STAYR with
 * liquidity in both the STAYR/WETH and WETH/USDG pools.
 */
export async function deployStayr(overrides: Partial<Record<string, unknown>> = {}) {
  const [deployer, alice, bob, carol, dave] = await ethers.getSigners();

  const weth = await new ethers.ContractFactory(WethArtifact.abi, WethArtifact.bytecode, deployer).deploy();
  const factory = await new ethers.ContractFactory(FactoryArtifact.abi, FactoryArtifact.bytecode, deployer).deploy(
    deployer.address,
  );
  const router = await new ethers.ContractFactory(RouterArtifact.abi, RouterArtifact.bytecode, deployer).deploy(
    await factory.getAddress(),
    await weth.getAddress(),
  );
  const usdg = (await (await ethers.getContractFactory("MockUSDG")).deploy()) as MockUSDG;

  const params = defaultParams({
    supplyRecipient: deployer.address,
    factory: await factory.getAddress(),
    router: await router.getAddress(),
    weth: await weth.getAddress(),
    usdg: await usdg.getAddress(),
    ...overrides,
  });
  const vault = (await (await ethers.getContractFactory("StayrRewards")).deploy(params)) as StayrRewards;
  const vaultAddress = await vault.getAddress();
  const token = (await ethers.getContractAt("StayrToken", await vault.token())) as StayrToken;
  const tokenAddress = await token.getAddress();

  const routerAt = (runner: ContractRunner) => new ethers.Contract(router.target, ROUTER_ABI, runner);
  const factoryC = new ethers.Contract(factory.target, FACTORY_ABI, deployer);

  // STAYR/WETH: 500M STAYR against 100 ETH. The deposit itself is a pool
  // trade for the token (tokens entering a pool) and pays the fee.
  await token.approve(router.target, SUPPLY);
  await routerAt(deployer).addLiquidityETH(
    tokenAddress,
    SUPPLY / 2n,
    0,
    0,
    deployer.address,
    DEADLINE(),
    { value: ethers.parseEther("100") },
  );
  // WETH/USDG: 50 ETH against 130,000 USDG (≈ $2,600 / ETH) for claim swaps.
  await usdg.mint(deployer.address, 130_000n * 10n ** 6n);
  await usdg.approve(router.target, 130_000n * 10n ** 6n);
  await routerAt(deployer).addLiquidityETH(
    usdg.target,
    130_000n * 10n ** 6n,
    0,
    0,
    deployer.address,
    DEADLINE(),
    { value: ethers.parseEther("50") },
  );

  const pairAddress = await token.wethPair();
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, deployer);

  async function buy(user: Signer, eth: bigint) {
    const addr = await user.getAddress();
    return routerAt(user).swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      [await weth.getAddress(), tokenAddress],
      addr,
      DEADLINE(),
      { value: eth },
    );
  }

  async function sell(user: Signer, amount: bigint) {
    const addr = await user.getAddress();
    await token.connect(user).approve(router.target, amount);
    return routerAt(user).swapExactTokensForETHSupportingFeeOnTransferTokens(
      amount,
      0,
      [tokenAddress, await weth.getAddress()],
      addr,
      DEADLINE(),
    );
  }

  return {
    deployer,
    alice,
    bob,
    carol,
    dave,
    weth,
    factory: factoryC,
    router: routerAt(deployer),
    routerAt,
    usdg,
    vault,
    vaultAddress,
    token,
    tokenAddress,
    pair,
    pairAddress,
    params,
    buy,
    sell,
  };
}

export type Stayr = Awaited<ReturnType<typeof deployStayr>>;

/** Moves the chain forward by whole epochs, landing just after an epoch boundary. */
export async function advanceEpochs(vault: StayrRewards, epochs: number) {
  const genesis = Number(await vault.genesis());
  const epochSeconds = Number(await vault.epochSeconds());
  const current = Number(await vault.currentEpoch());
  const target = genesis + (current + epochs) * epochSeconds + 1;
  await time.increaseTo(target);
}

export async function ethBalance(address: string) {
  return ethers.provider.getBalance(address);
}

export function closeTo(a: bigint, b: bigint, tolerance: bigint) {
  const d = a > b ? a - b : b - a;
  return d <= tolerance;
}
