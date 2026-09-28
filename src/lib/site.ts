import { ACTIVE_CHAIN_ID, activeChain, LOCAL_ID, ROBINHOOD_MAINNET_ID, VENUE } from "@/lib/chain";

export const site = {
  name: "STAYR",
  wordmark: "stayr",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://stayr.xyz",
  /** The only host the app should be served from; anything else is flagged in the app. */
  officialHost: process.env.NEXT_PUBLIC_OFFICIAL_HOST ?? "stayr.xyz",
  x: "https://x.com/stayr_xyz",
  xHandle: "@stayr_xyz",
  /** Public source repository, shown wherever the contracts are — set once the repo is public. */
  repo: process.env.NEXT_PUBLIC_REPO_URL ?? null,
  tagline: "Patience pays.",
  description: "Trading fees belong to holders. Stay longer to increase your share. Built for Robinhood Chain.",
} as const;

function address(v: string | undefined): `0x${string}` | null {
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : null;
}

/**
 * The deployed contracts, if any. Both come from the environment (or from
 * contracts/deployments/<network>.json through next.config.ts). Until both
 * are set the site shows its "not deployed" status everywhere instead of an
 * address, and the app runs read-only.
 */
export const contracts = {
  token: address(process.env.NEXT_PUBLIC_STAYR_TOKEN),
  rewards: address(process.env.NEXT_PUBLIC_STAYR_REWARDS),
  chainId: ACTIVE_CHAIN_ID,
  chainName: activeChain.name,
  venue: VENUE[ACTIVE_CHAIN_ID] ?? {},
  /** Source verification link, set once the explorer has verified the source. */
  verified: process.env.NEXT_PUBLIC_SOURCE_VERIFIED === "true",
  tradeUrl: process.env.NEXT_PUBLIC_TRADE_URL ?? null,
} as const;

export const deployed = contracts.token !== null && contracts.rewards !== null;
export const isLocal = ACTIVE_CHAIN_ID === LOCAL_ID;
export const isMainnet = ACTIVE_CHAIN_ID === ROBINHOOD_MAINNET_ID;

/**
 * Deployment-time parameters, mirrored here for the landing copy. The app
 * reads the live values from `config()` and these are only used where no
 * contract is deployed yet. Labelled as local assumptions in ECONOMICS.md.
 */
export const economics = {
  feeBps: 200,
  epochSeconds: 60,
  baseMultiplier: 1,
  milestones: [
    { afterSeconds: 60 * 60, multiplier: 1.5, label: "1 hour" },
    { afterSeconds: 2 * 60 * 60, multiplier: 2, label: "2 hours" },
    { afterSeconds: 24 * 60 * 60, multiplier: 3, label: "24 hours" },
  ],
  harvestCapBps: 50,
  harvestCooldownSeconds: 10 * 60,
} as const;
