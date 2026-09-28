import * as fs from "fs";
import * as path from "path";
import hre, { ethers } from "hardhat";
import { stayrParams } from "./lib/venue";
import { deploymentsDir } from "./lib/exportAbi";

/** Source verification on Blockscout for the record written by deploy.ts. */
async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const fileName = chainId === 4663 ? "robinhood.json" : chainId === 46630 ? "robinhood-testnet.json" : `chain-${chainId}.json`;
  const record = JSON.parse(fs.readFileSync(path.join(deploymentsDir, fileName), "utf8"));
  const params = stayrParams(
    { factory: record.uniswapV2Factory, router: record.uniswapV2Router, weth: record.weth, usdg: record.usdg },
    process.env.SUPPLY_RECIPIENT ?? record.deployer,
  );
  await hre.run("verify:verify", { address: record.rewards, constructorArguments: [params] });
  await hre.run("verify:verify", {
    address: record.token,
    constructorArguments: [
      params.name,
      params.symbol,
      params.supply,
      params.supplyRecipient,
      params.factory,
      params.weth,
      params.usdg,
      params.feeBps,
    ],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
