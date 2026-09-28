import * as fs from "fs";
import * as path from "path";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

export const frontendAbiDir = path.resolve(__dirname, "../../../src/lib/abi");
export const deploymentsDir = path.resolve(__dirname, "../../deployments");

const EXPORTED = ["StayrToken", "StayrRewards"] as const;

export type DeploymentRecord = {
  network: string;
  chainId: number;
  deployer: string;
  token: string;
  rewards: string;
  uniswapV2Factory: string;
  uniswapV2Router: string;
  weth: string;
  usdg: string;
  pairWeth: string | null;
  pairUsdg: string | null;
  feeBps: number;
  epochSeconds: number;
  tiers: { afterSeconds: number; multiplierBps: number }[];
  deployedAt: string;
  txHash: string | null;
};

/**
 * Writes each exported contract's ABI to ../src/lib/abi/<Name>.json as a
 * plain JSON array, so the front end imports them `as const` through a
 * typed wrapper and viem infers argument types.
 */
export async function exportAbis(hre: HardhatRuntimeEnvironment): Promise<void> {
  fs.mkdirSync(frontendAbiDir, { recursive: true });
  for (const name of EXPORTED) {
    const artifact = await hre.artifacts.readArtifact(name);
    const file = path.join(frontendAbiDir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(artifact.abi, null, 2) + "\n");
  }
}

export function writeDeployment(fileName: string, record: DeploymentRecord): string {
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const file = path.join(deploymentsDir, fileName);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  return file;
}
