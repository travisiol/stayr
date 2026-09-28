"use client";

import { useSyncExternalStore } from "react";
import { useBlock, useReadContract } from "wagmi";
import { rewardsAbi, routerAbi, tokenAbi } from "@/lib/abi";
import { activeChain } from "@/lib/chain";
import { contracts, deployed } from "@/lib/site";

// ------------------------------------------------------------ local clock

let tick = 0;
const listeners = new Set<() => void>();
let timer: number | undefined;

function subscribeTick(cb: () => void) {
  if (tick === 0) tick = Date.now();
  listeners.add(cb);
  if (timer === undefined) {
    timer = window.setInterval(() => {
      tick = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Wall-clock milliseconds, ticking once a second; 0 on the server. */
export function useTick(): number {
  return useSyncExternalStore(subscribeTick, () => tick, () => 0);
}

/**
 * The chain's clock, not the browser's: the latest block timestamp plus the
 * seconds elapsed locally since it was read. On Robinhood Chain the two
 * agree; on the local Hardhat node (whose time is moved by the seed script)
 * only this one matches what the contract sees.
 */
export function useChainNow(): number | null {
  const tickMs = useTick();
  const block = useBlock({ chainId: activeChain.id, query: { refetchInterval: 15_000, staleTime: 10_000 } });
  if (!block.data || tickMs === 0) return null;
  const readAt = block.dataUpdatedAt || tickMs;
  return Number(block.data.timestamp) + Math.max(0, Math.floor((tickMs - readAt) / 1000));
}

// ------------------------------------------------------------ contract reads

const REFRESH = 10_000;
const STALE_AFTER = 45_000;

export function useRewardsConfig() {
  return useReadContract({
    address: contracts.rewards ?? undefined,
    abi: rewardsAbi,
    functionName: "config",
    chainId: activeChain.id,
    query: { enabled: deployed, staleTime: 60_000 },
  });
}

export function useProtocolStats() {
  return useReadContract({
    address: contracts.rewards ?? undefined,
    abi: rewardsAbi,
    functionName: "stats",
    chainId: activeChain.id,
    query: { enabled: deployed, refetchInterval: REFRESH },
  });
}

export function useHolder(address?: `0x${string}`) {
  return useReadContract({
    address: contracts.rewards ?? undefined,
    abi: rewardsAbi,
    functionName: "holderOf",
    args: address ? [address] : undefined,
    chainId: activeChain.id,
    query: { enabled: deployed && Boolean(address), refetchInterval: REFRESH },
  });
}

export function useTokenBalance(address?: `0x${string}`) {
  return useReadContract({
    address: contracts.token ?? undefined,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChain.id,
    query: { enabled: deployed && Boolean(address), refetchInterval: REFRESH },
  });
}

export function useTotalSupply() {
  return useReadContract({
    address: contracts.token ?? undefined,
    abi: tokenAbi,
    functionName: "totalSupply",
    chainId: activeChain.id,
    query: { enabled: deployed, staleTime: 60_000 },
  });
}

/** ETH → USDG quote on the Uniswap v2 WETH/USDG pool, for the claim-time swap. */
export function useUsdgQuote(ethAmount: bigint | undefined) {
  const v = contracts.venue;
  const enabled = Boolean(v.router && v.weth && v.usdg && ethAmount && ethAmount > 0n);
  return useReadContract({
    address: v.router,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: enabled ? [ethAmount as bigint, [v.weth as `0x${string}`, v.usdg as `0x${string}`]] : undefined,
    chainId: activeChain.id,
    query: { enabled, refetchInterval: REFRESH },
  });
}

/** Whether a read is stale: it has failed, or has not refreshed in a while. */
export function readFreshness(q: { dataUpdatedAt: number; isError: boolean; data: unknown }, nowMs: number) {
  if (q.data === undefined) return { stale: false, ageSeconds: null as number | null };
  const age = nowMs === 0 ? 0 : Math.max(0, Math.floor((nowMs - q.dataUpdatedAt) / 1000));
  return { stale: q.isError || nowMs - q.dataUpdatedAt > STALE_AFTER, ageSeconds: age };
}
