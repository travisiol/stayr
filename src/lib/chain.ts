import { defineChain, type Chain } from "viem";

/**
 * Robinhood Chain — verified against the official documentation on
 * 2026-09-28 (https://docs.robinhood.com/chain/connecting), and the chain
 * ids confirmed live with eth_chainId on both public RPCs.
 *
 *   mainnet   4663  (0x1237)  https://rpc.mainnet.chain.robinhood.com
 *   testnet  46630  (0xb626)  https://rpc.testnet.chain.robinhood.com
 *
 * Nothing here is guessed; override per environment with the NEXT_PUBLIC_*
 * variables listed in .env.example.
 */
export const ROBINHOOD_MAINNET_ID = 4663;
export const ROBINHOOD_TESTNET_ID = 46630;
export const LOCAL_ID = 31337;

export const robinhoodChain = defineChain({
  id: ROBINHOOD_MAINNET_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Explorer", url: "https://robinhoodchain.blockscout.com" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: false,
});

export const robinhoodTestnet = defineChain({
  id: ROBINHOOD_TESTNET_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Testnet Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

/** `npm run node:local` — a Hardhat node on port 8868 with real Uniswap v2 bytecode. */
export const localChain = defineChain({
  id: LOCAL_ID,
  name: "STAYR local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8868"] } },
  testnet: true,
});

export const chains: Record<number, Chain> = {
  [ROBINHOOD_MAINNET_ID]: robinhoodChain,
  [ROBINHOOD_TESTNET_ID]: robinhoodTestnet,
  [LOCAL_ID]: localChain,
};

/** The chain this build is configured for. Mainnet unless told otherwise. */
export const ACTIVE_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? ROBINHOOD_MAINNET_ID);
export const activeChain: Chain = chains[ACTIVE_CHAIN_ID] ?? robinhoodChain;

/**
 * Venue and asset addresses. Mainnet values verified on chain on 2026-09-28:
 * router.factory() and router.WETH() return the factory and WETH below,
 * USDG reports symbol "USDG" / 6 decimals, and a WETH/USDG v2 pair exists
 * (0x8803c117ccae7b5146297876c2a25df135141c4d). Testnet deployments of
 * Uniswap and USDG are not published in the official docs — left blank,
 * to be filled from a verified source before a testnet deployment.
 */
export const VENUE: Record<number, { factory?: `0x${string}`; router?: `0x${string}`; weth?: `0x${string}`; usdg?: `0x${string}` }> = {
  [ROBINHOOD_MAINNET_ID]: {
    factory: "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f",
    router: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba",
    weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  },
  [ROBINHOOD_TESTNET_ID]: {},
  [LOCAL_ID]: {
    factory: env("NEXT_PUBLIC_UNISWAP_V2_FACTORY"),
    router: env("NEXT_PUBLIC_UNISWAP_V2_ROUTER"),
    weth: env("NEXT_PUBLIC_WETH"),
    usdg: env("NEXT_PUBLIC_USDG"),
  },
};

function env(name: string): `0x${string}` | undefined {
  // Only static property access is inlined into the client bundle.
  const v =
    name === "NEXT_PUBLIC_UNISWAP_V2_FACTORY"
      ? process.env.NEXT_PUBLIC_UNISWAP_V2_FACTORY
      : name === "NEXT_PUBLIC_UNISWAP_V2_ROUTER"
        ? process.env.NEXT_PUBLIC_UNISWAP_V2_ROUTER
        : name === "NEXT_PUBLIC_WETH"
          ? process.env.NEXT_PUBLIC_WETH
          : process.env.NEXT_PUBLIC_USDG;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function explorerAddress(address: string, chain: Chain = activeChain): string | null {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : null;
}

export function explorerTx(hash: string, chain: Chain = activeChain): string | null {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}
