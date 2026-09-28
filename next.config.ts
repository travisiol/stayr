import * as fs from "node:fs";
import * as path from "node:path";
import type { NextConfig } from "next";

/**
 * Contract addresses come from NEXT_PUBLIC_STAYR_TOKEN / _REWARDS, or — when
 * those are unset — from the record the deploy scripts write under
 * contracts/deployments/ for the configured chain. `npm run deploy:local`
 * followed by `npm run dev` is the whole hand-off for the local stack.
 */
function deploymentEnv(): Record<string, string> {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);
  const fileName = chainId === 31337 ? "local.json" : chainId === 46630 ? "robinhood-testnet.json" : "robinhood.json";
  const file = path.join(process.cwd(), "contracts", "deployments", fileName);
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    if (Number(r.chainId) !== chainId) return {};
    const env: Record<string, string> = {};
    const put = (key: string, value: unknown) => {
      if (!process.env[key] && typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) env[key] = value;
    };
    put("NEXT_PUBLIC_STAYR_TOKEN", r.token);
    put("NEXT_PUBLIC_STAYR_REWARDS", r.rewards);
    if (chainId === 31337) {
      put("NEXT_PUBLIC_UNISWAP_V2_FACTORY", r.uniswapV2Factory);
      put("NEXT_PUBLIC_UNISWAP_V2_ROUTER", r.uniswapV2Router);
      put("NEXT_PUBLIC_WETH", r.weth);
      put("NEXT_PUBLIC_USDG", r.usdg);
    }
    return env;
  } catch {
    return {};
  }
}

const nextConfig: NextConfig = {
  env: deploymentEnv(),
  // Headless captures (scripts/capture.mjs) load the dev server by IP.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
