import hre, { ethers } from "hardhat";
import { deployLocalVenue, FAR_DEADLINE, routerAt, stayrParams } from "./lib/venue";
import { writeDeployment } from "./lib/exportAbi";

/**
 * Local stack on the Hardhat node (`npm run node`, port 8868):
 *   real Uniswap v2 bytecode + WETH9 + mock USDG → STAYR vault + token →
 *   STAYR/WETH and WETH/USDG liquidity. Writes contracts/deployments/local.json,
 *   which next.config.ts reads when NEXT_PUBLIC_CHAIN_ID=31337.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 31337n) throw new Error(`deploy-local is for the local node only (chain ${net.chainId})`);

  const venue = await deployLocalVenue(deployer);
  console.log("venue", venue.factory, venue.router, venue.weth, venue.usdg);

  const params = stayrParams(venue, deployer.address);
  const vault = await (await ethers.getContractFactory("StayrRewards")).deploy(params);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  const tokenAddress = await vault.token();
  const token = await ethers.getContractAt("StayrToken", tokenAddress);
  console.log("StayrRewards", vaultAddress);
  console.log("StayrToken  ", tokenAddress);

  const router = routerAt(venue.router, deployer);
  // 400M STAYR against 40 ETH (the deposit pays the 2% pool fee to the vault)
  await (await token.approve(venue.router, params.supply)).wait();
  await (
    await router.addLiquidityETH(tokenAddress, ethers.parseEther("400000000"), 0, 0, deployer.address, FAR_DEADLINE, {
      value: ethers.parseEther("40"),
    })
  ).wait();
  // WETH/USDG: 20 ETH against 52,000 USDG (≈ $2,600 / ETH) for claim swaps
  const usdgAmount = 52_000n * 10n ** 6n;
  await (await venue.usdgContract.mint(deployer.address, usdgAmount)).wait();
  await (await venue.usdgContract.approve(venue.router, usdgAmount)).wait();
  await (
    await router.addLiquidityETH(venue.usdg, usdgAmount, 0, 0, deployer.address, FAR_DEADLINE, {
      value: ethers.parseEther("20"),
    })
  ).wait();

  const block = await ethers.provider.getBlock("latest");
  const file = writeDeployment("local.json", {
    network: hre.network.name,
    chainId: Number(net.chainId),
    deployer: deployer.address,
    token: tokenAddress,
    rewards: vaultAddress,
    uniswapV2Factory: venue.factory,
    uniswapV2Router: venue.router,
    weth: venue.weth,
    usdg: venue.usdg,
    pairWeth: await token.wethPair(),
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
  console.log("wrote", file);
  console.log("\nSite env for this stack (next.config.ts reads local.json automatically):");
  console.log(`NEXT_PUBLIC_CHAIN_ID=31337`);
  console.log(`NEXT_PUBLIC_STAYR_TOKEN=${tokenAddress}`);
  console.log(`NEXT_PUBLIC_STAYR_REWARDS=${vaultAddress}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
