import hre, { ethers } from "hardhat";
import { stayrParams } from "./lib/venue";
import { writeDeployment } from "./lib/exportAbi";

/**
 * Deploys the vault (which deploys the token) on Robinhood Chain testnet or
 * mainnet. Every venue address must be supplied explicitly and verified —
 * nothing is guessed. The vault's constructor cross-checks the router's
 * factory() and WETH() against what is passed.
 *
 *   UNISWAP_V2_FACTORY=0x… UNISWAP_V2_ROUTER=0x… WETH=0x… USDG=0x…
 *   DEPLOYER_PRIVATE_KEY=… npm run deploy:testnet
 *
 * Mainnet additionally requires CONFIRM_MAINNET=yes. This script does not
 * add liquidity; that is a separate, deliberate step by the operator.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  if (chainId === 4663 && process.env.CONFIRM_MAINNET !== "yes") {
    throw new Error("Refusing to deploy to Robinhood Chain mainnet without CONFIRM_MAINNET=yes");
  }
  const venue = {
    factory: required("UNISWAP_V2_FACTORY"),
    router: required("UNISWAP_V2_ROUTER"),
    weth: required("WETH"),
    usdg: required("USDG"),
  };
  for (const [k, v] of Object.entries(venue)) {
    const code = await ethers.provider.getCode(v);
    if (code === "0x") throw new Error(`${k} ${v} has no code on chain ${chainId}`);
  }

  const params = stayrParams(venue, process.env.SUPPLY_RECIPIENT ?? deployer.address);
  console.log("deploying StayrRewards with", JSON.stringify(params, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  const vault = await (await ethers.getContractFactory("StayrRewards")).deploy(params);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  const tokenAddress = await vault.token();
  const block = await ethers.provider.getBlock("latest");

  const fileName = chainId === 4663 ? "robinhood.json" : chainId === 46630 ? "robinhood-testnet.json" : `chain-${chainId}.json`;
  const file = writeDeployment(fileName, {
    network: hre.network.name,
    chainId,
    deployer: deployer.address,
    token: tokenAddress,
    rewards: vaultAddress,
    uniswapV2Factory: venue.factory,
    uniswapV2Router: venue.router,
    weth: venue.weth,
    usdg: venue.usdg,
    pairWeth: null,
    pairUsdg: null,
    feeBps: params.feeBps,
    epochSeconds: params.epochSeconds,
    tiers: params.milestoneEpochs.map((e, i) => ({
      afterSeconds: e * params.epochSeconds,
      multiplierBps: params.milestoneMultiplierBps[i],
    })),
    deployedAt: new Date((block?.timestamp ?? 0) * 1000).toISOString(),
    txHash: vault.deploymentTransaction()?.hash ?? null,
  });
  console.log("StayrRewards", vaultAddress);
  console.log("StayrToken  ", tokenAddress);
  console.log("wrote", file);
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} must be a verified 0x address`);
  return v;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
