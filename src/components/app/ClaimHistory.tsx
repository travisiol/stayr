"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { activeChain, explorerTx } from "@/lib/chain";
import { contracts } from "@/lib/site";
import { fmtEth, fmtUsdg } from "@/lib/format";
import { ExternalIcon } from "@/components/icons";

const CLAIMED = parseAbiItem(
  "event Claimed(address indexed account, uint8 payout, uint256 ethAmount, uint256 usdgAmount, uint256 ethSwapped, uint256 usdgReceived)",
);
const CHUNK = 400_000n; // the public RPC refuses wider eth_getLogs ranges
const MAX_SPAN = 4_000_000n;

function startBlock(latest: bigint): bigint {
  const env = process.env.NEXT_PUBLIC_STAYR_START_BLOCK;
  const configured = env && /^\d+$/.test(env) ? BigInt(env) : null;
  if (configured !== null) return configured;
  return latest > MAX_SPAN ? latest - MAX_SPAN : 0n;
}

export type ClaimRow = {
  hash: `0x${string}`;
  block: bigint;
  timestamp: number;
  payout: "ETH" | "USDG";
  ethAmount: bigint;
  usdgAmount: bigint;
  usdgReceived: bigint;
};

export function useClaimHistory(address?: `0x${string}`) {
  const client = usePublicClient({ chainId: activeChain.id });
  return useQuery({
    queryKey: ["stayr-claims", activeChain.id, contracts.rewards, address],
    enabled: Boolean(client && address && contracts.rewards),
    refetchInterval: 30_000,
    queryFn: async (): Promise<ClaimRow[]> => {
      if (!client || !address || !contracts.rewards) return [];
      const latest = await client.getBlockNumber();
      const rows: ClaimRow[] = [];
      for (let from = startBlock(latest); from <= latest; from += CHUNK) {
        const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
        const logs = await client.getLogs({ address: contracts.rewards, event: CLAIMED, args: { account: address }, fromBlock: from, toBlock: to });
        for (const log of logs) {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          rows.push({
            hash: log.transactionHash,
            block: log.blockNumber,
            timestamp: Number(block.timestamp),
            payout: log.args.payout === 1 ? "USDG" : "ETH",
            ethAmount: log.args.ethAmount ?? 0n,
            usdgAmount: log.args.usdgAmount ?? 0n,
            usdgReceived: log.args.usdgReceived ?? 0n,
          });
        }
      }
      return rows.sort((a, b) => Number(b.block - a.block));
    },
  });
}

export function ClaimHistory({ address }: { address: `0x${string}` }) {
  const q = useClaimHistory(address);
  return (
    <section className="card p-6 sm:p-8" aria-labelledby="history-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="history-heading" className="display-md text-[22px]">
          Claim history
        </h2>
        <span className="text-[12.5px] text-moss-soft">{q.isFetching ? "scanning…" : q.data ? `${q.data.length} claim${q.data.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      {q.isError ? (
        <p className="mt-4 rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-danger">Could not read claim events from the chain. Try again in a moment.</p>
      ) : !q.data ? (
        <div className="mt-4 h-10 animate-pulse rounded-[10px] bg-cream-deep" aria-hidden="true" />
      ) : q.data.length === 0 ? (
        <p className="mt-4 text-[14px] text-moss">No claims from this wallet yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {q.data.map((r) => {
            const link = explorerTx(r.hash);
            return (
              <li key={r.hash} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 text-[14px]">
                <div className="num text-moss">{new Date(r.timestamp * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
                <div className="num font-semibold text-forest">
                  {r.payout === "USDG" && r.usdgReceived > 0n
                    ? `${fmtUsdg(r.usdgReceived + r.usdgAmount)} USDG (from ${fmtEth(r.ethAmount, 6)} ETH)`
                    : `${fmtEth(r.ethAmount, 6)} ETH${r.usdgAmount > 0n ? ` + ${fmtUsdg(r.usdgAmount)} USDG` : ""}`}
                </div>
                <div className="mono">
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest underline">
                      {r.hash.slice(0, 10)}…{r.hash.slice(-6)} <ExternalIcon />
                    </a>
                  ) : (
                    <span className="text-moss">
                      {r.hash.slice(0, 10)}…{r.hash.slice(-6)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
