"use client";

import { useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { BaseError, ContractFunctionRevertedError, parseEventLogs } from "viem";
import { clsx } from "clsx";
import { rewardsAbi } from "@/lib/abi";
import { activeChain, explorerTx } from "@/lib/chain";
import { contracts } from "@/lib/site";
import { bpsToMultiplier, fmtEth, fmtUsdg } from "@/lib/format";
import { formatDuration, formatMultiplier } from "@/lib/rewards-math";
import { useUsdgQuote } from "@/lib/hooks";
import { describe } from "@/components/app/ConnectDialog";
import { CheckIcon, ExternalIcon, WarnIcon } from "@/components/icons";

export type HolderView = {
  balance: bigint;
  startEpoch: bigint;
  sinceEpoch: bigint;
  tier: number;
  multiplierBps: number;
  weight: bigint;
  claimableEth: bigint;
  claimableUsdg: bigint;
  nextMilestoneEpoch: bigint;
  nextMultiplierBps: number;
};

export type RewardsConfig = {
  genesis: bigint;
  epochSeconds: number;
  milestoneEpochs: readonly number[];
  milestoneMultiplierBps: readonly number[];
  baseMultiplierBps: number;
};

type ClaimArgs = readonly [number, bigint, bigint];

type TxState =
  | { phase: "idle" }
  | { phase: "simulating" }
  | { phase: "preview"; args: ClaimArgs }
  | { phase: "signing"; args: ClaimArgs }
  | { phase: "pending"; hash: `0x${string}` }
  | { phase: "success"; hash: `0x${string}`; block: bigint; ethPaid: bigint; usdgPaid: bigint; usdgReceived: bigint }
  | { phase: "reverted"; hash: `0x${string}` }
  | { phase: "rejected" }
  | { phase: "blocked"; reason: string }
  | { phase: "error"; message: string };

const SLIPPAGE_BPS = 50n; // 0.5%

/** Names a revert from the vault in plain words. */
function explainRevert(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason ?? "";
      if (name === "NothingToClaim") return "The contract reports nothing to claim for this address right now.";
      if (name === "Expired") return "The quote deadline passed before the simulation ran. Try again.";
      if (name === "EthTransferFailed") return "Your wallet address cannot receive ETH (a contract without a payable fallback). Claim as USDG instead.";
      if (/INSUFFICIENT_OUTPUT_AMOUNT/.test(name)) return "The USDG pool moved beyond the 0.5% tolerance. Re-quote and try again.";
      if (name) return `The contract would revert: ${name}.`;
    }
    return e.shortMessage;
  }
  return describe(e);
}

/**
 * The dominant panel: what can be claimed, the multiplier, and the time to
 * the next milestone. The countdown ticks locally; the claimable figures are
 * whatever the contract last reported and are labelled with their age.
 *
 * A claim goes: simulate against the chain → show the exact call and its
 * expected outcome → the wallet prompt → receipt → the decoded `Claimed`
 * event. Nothing is called "confirmed" before the receipt says so.
 */
export function RewardPanel({
  address,
  holder,
  config,
  now,
  ageSeconds,
  stale,
  onClaimed,
}: {
  address: `0x${string}`;
  holder: HolderView;
  config: RewardsConfig;
  now: number | null;
  ageSeconds: number | null;
  stale: boolean;
  onClaimed: () => void;
}) {
  const [payout, setPayout] = useState<"eth" | "usdg">("eth");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const { mutateAsync: writeContract } = useWriteContract();
  const client = usePublicClient({ chainId: activeChain.id });
  const quote = useUsdgQuote(payout === "usdg" ? holder.claimableEth : undefined);

  const hasClaim = holder.claimableEth > 0n || holder.claimableUsdg > 0n;
  const busy = tx.phase === "simulating" || tx.phase === "preview" || tx.phase === "signing" || tx.phase === "pending";
  const multiplier = bpsToMultiplier(holder.multiplierBps);
  const topTier = holder.nextMilestoneEpoch === 0n;

  // countdown to the next milestone, on the chain's clock
  const epochSeconds = Number(config.epochSeconds);
  const nextAt = topTier ? null : Number(config.genesis) + Number(holder.nextMilestoneEpoch) * epochSeconds;
  const remaining = nextAt !== null && now !== null ? Math.max(0, nextAt - now) : null;
  const tierStart =
    Number(config.genesis) +
    (Number(holder.startEpoch) + 1 + (holder.tier === 0 ? 0 : Number(config.milestoneEpochs[holder.tier - 1]))) * epochSeconds;
  const progress =
    nextAt !== null && now !== null && nextAt > tierStart ? Math.min(1, Math.max(0, (now - tierStart) / (nextAt - tierStart))) : 1;

  const usdgOut = quote.data ? quote.data[1] : null;
  const minOut = usdgOut ? (usdgOut * (10_000n - SLIPPAGE_BPS)) / 10_000n : 0n;
  const quoteMissing = payout === "usdg" && holder.claimableEth > 0n && usdgOut === null;

  async function prepare() {
    if (!contracts.rewards || !client) return;
    setTx({ phase: "simulating" });
    const deadline = BigInt((now ?? Math.floor(Date.now() / 1000)) + 15 * 60);
    const args: ClaimArgs = payout === "usdg" ? [1, minOut, deadline] : [0, 0n, 0n];
    try {
      await client.simulateContract({ address: contracts.rewards, abi: rewardsAbi, functionName: "claim", args, account: address });
      setTx({ phase: "preview", args });
    } catch (e) {
      setTx({ phase: "blocked", reason: explainRevert(e) });
    }
  }

  async function send(args: ClaimArgs) {
    if (!contracts.rewards || !client) return;
    setTx({ phase: "signing", args });
    try {
      const hash = await writeContract({
        address: contracts.rewards,
        abi: rewardsAbi,
        functionName: "claim",
        args,
        chainId: activeChain.id,
        account: address,
      });
      setTx({ phase: "pending", hash });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        const [ev] = parseEventLogs({ abi: rewardsAbi, logs: receipt.logs, eventName: "Claimed" });
        setTx({
          phase: "success",
          hash,
          block: receipt.blockNumber,
          ethPaid: ev?.args.ethAmount ?? 0n,
          usdgPaid: ev?.args.usdgAmount ?? 0n,
          usdgReceived: ev?.args.usdgReceived ?? 0n,
        });
      } else {
        setTx({ phase: "reverted", hash });
      }
      onClaimed();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTx(/user rejected|user denied|rejected the request|4001/i.test(msg) ? { phase: "rejected" } : { phase: "error", message: describe(e) });
    }
  }

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="claimable-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="claimable-heading" className="text-[14px] font-medium text-moss">
            Claimable rewards
          </h2>
          <p className="num display-md mt-1 text-[clamp(40px,6vw,64px)] leading-none">
            {fmtEth(holder.claimableEth, 6)} <span className="text-[0.42em] font-semibold text-moss">ETH</span>
          </p>
          {holder.claimableUsdg > 0n && (
            <p className="num mt-2 text-[18px] font-semibold text-forest">
              + {fmtUsdg(holder.claimableUsdg)} <span className="text-[13px] text-moss">USDG accrued</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {stale ? (
            <span className="chip chip-danger">
              <WarnIcon width={13} height={13} /> Stale data
            </span>
          ) : (
            <span className="chip">Contract accounting</span>
          )}
          <span className="num text-[12px] text-moss-soft">{ageSeconds === null ? "reading…" : `as of ${ageSeconds}s ago`}</span>
        </div>
      </div>

      <div className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <div>
          <p className="text-[13px] font-medium text-moss">Current multiplier</p>
          <p className="num display-md mt-1 text-[48px] leading-none">{formatMultiplier(multiplier)}</p>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="font-medium text-moss">
              {topTier
                ? "Top multiplier reached"
                : holder.balance === 0n
                  ? "No open position"
                  : `Next: ${formatMultiplier(bpsToMultiplier(holder.nextMultiplierBps))}`}
            </span>
            {!topTier && holder.balance > 0n && (
              <span className="num font-semibold text-forest">
                {remaining === null ? "—" : remaining === 0 ? "at the next epoch" : `in ${formatDuration(remaining)}`}
              </span>
            )}
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-cream-deep" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full rounded-full bg-lime-deep transition-[width] duration-1000 ease-linear" style={{ width: `${(holder.balance === 0n ? 0 : progress) * 100}%` }} />
          </div>
          <p className="mt-2 text-[12.5px] text-moss-soft">
            Milestones are credited at the next one-minute epoch boundary. Selling or transferring out resets the clock.
          </p>
        </div>
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <p className="text-[13px] font-medium text-moss">Payout asset</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm" role="radiogroup" aria-label="Payout asset">
          {(["eth", "usdg"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={payout === k}
              disabled={busy}
              onClick={() => setPayout(k)}
              className={clsx(
                "h-12 rounded-[12px] text-[15px] font-semibold transition-colors",
                payout === k ? "bg-forest text-cream" : "bg-cream/70 text-forest shadow-[inset_0_0_0_1.5px_var(--line-strong)] hover:bg-cream",
              )}
            >
              {k === "eth" ? "ETH" : "USDG"}
            </button>
          ))}
        </div>
        {payout === "usdg" ? (
          <dl className="mt-4 grid gap-1.5 rounded-[12px] bg-cream/70 p-4 text-[13.5px] text-moss sm:max-w-md">
            <Line k="Swap" v={holder.claimableEth > 0n ? `${fmtEth(holder.claimableEth, 6)} ETH → USDG on Uniswap v2` : "nothing to swap"} />
            <Line k="Quoted" v={usdgOut !== null ? `${fmtUsdg(usdgOut)} USDG` : quote.isError ? "quote unavailable" : holder.claimableEth > 0n ? "quoting…" : "—"} />
            <Line k="Slippage tolerance" v="0.50%" />
            <Line k="Minimum received" v={usdgOut !== null ? `${fmtUsdg(minOut)} USDG` : "—"} />
            <Line k="Fees" v="Uniswap pool fee 0.30% (in the quote) + gas. STAYR charges nothing on claims." />
            {holder.claimableUsdg > 0n && <Line k="Plus" v={`${fmtUsdg(holder.claimableUsdg)} USDG accrued, paid as is`} />}
          </dl>
        ) : (
          <p className="mt-3 text-[13px] text-moss">
            ETH is sent to your wallet as accrued{holder.claimableUsdg > 0n ? ", and accrued USDG with it" : ""}. No swap, no approval, only gas.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" className="btn btn-primary min-w-[200px]" disabled={!hasClaim || busy || quoteMissing} onClick={prepare}>
          {tx.phase === "simulating"
            ? "Simulating…"
            : tx.phase === "preview" || tx.phase === "signing"
              ? "Review below"
              : tx.phase === "pending"
                ? "Claiming…"
                : hasClaim
                  ? `Claim ${payout === "usdg" ? "as USDG" : "ETH"}`
                  : "Nothing to claim yet"}
        </button>
        {!hasClaim && tx.phase === "idle" && (
          <p className="text-[13px] text-moss">Rewards appear here once fees are allocated while you hold.</p>
        )}
        {hasClaim && tx.phase === "idle" && (
          <p className="text-[13px] text-moss">Simulated on the chain first; you review the exact call before your wallet opens.</p>
        )}
      </div>

      {(tx.phase === "preview" || tx.phase === "signing") && (
        <Preview
          args={tx.args}
          payout={payout}
          holder={holder}
          usdgOut={usdgOut}
          signing={tx.phase === "signing"}
          onConfirm={() => send(tx.args)}
          onCancel={() => setTx({ phase: "idle" })}
        />
      )}

      <TxStatus tx={tx} onReset={() => setTx({ phase: "idle" })} />
    </section>
  );
}

function Preview({
  args,
  payout,
  holder,
  usdgOut,
  signing,
  onConfirm,
  onCancel,
}: {
  args: ClaimArgs;
  payout: "eth" | "usdg";
  holder: HolderView;
  usdgOut: bigint | null;
  signing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [payoutKind, minOut, deadline] = args;
  return (
    <div className="mt-5 rounded-[14px] border border-line-strong bg-cream/60 p-5" role="region" aria-label="Transaction preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="display-md text-[18px]">Review before your wallet opens</h3>
        <span className="chip chip-lime">
          <CheckIcon width={13} height={13} /> Simulation passed
        </span>
      </div>
      <dl className="mt-3 grid gap-1.5 text-[13.5px] text-moss">
        <Line k="To (rewards contract)" v={contracts.rewards ?? "—"} mono />
        <Line k="Function" v={`claim(payout=${payoutKind}, minUsdgOut=${minOut.toString()}, deadline=${deadline.toString()})`} mono />
        <Line k="ETH sent from your wallet" v="0 — only gas" />
        <Line k="Token approvals" v="none" />
        <Line
          k="Expected to receive"
          v={
            payout === "usdg"
              ? `${usdgOut !== null ? `≥ ${fmtUsdg(minOut)} USDG (quoted ${fmtUsdg(usdgOut)})` : "USDG"}${holder.claimableUsdg > 0n ? ` + ${fmtUsdg(holder.claimableUsdg)} USDG` : ""}`
              : `${fmtEth(holder.claimableEth, 6)} ETH${holder.claimableUsdg > 0n ? ` + ${fmtUsdg(holder.claimableUsdg)} USDG` : ""}`
          }
        />
      </dl>
      <p className="mt-3 text-[12.5px] text-moss-soft">
        Your wallet will show the same contract address. If it shows anything else, reject it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={signing} onClick={onConfirm}>
          {signing ? "Confirm in wallet…" : "Open wallet to confirm"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={signing} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Line({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0">{k}</dt>
      <dd className={clsx("text-right font-medium text-forest", mono ? "mono break-all" : "num")}>{v}</dd>
    </div>
  );
}

function TxStatus({ tx, onReset }: { tx: TxState; onReset: () => void }) {
  if (tx.phase === "idle" || tx.phase === "simulating" || tx.phase === "preview" || tx.phase === "signing") return null;
  const link = "hash" in tx ? explorerTx(tx.hash) : null;
  const hashLine = "hash" in tx && (
    <span className="mono ml-2 inline-flex items-center gap-1">
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
          {tx.hash.slice(0, 10)}…{tx.hash.slice(-6)} <ExternalIcon />
        </a>
      ) : (
        <>{tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}</>
      )}
    </span>
  );
  const tone =
    tx.phase === "success" ? "bg-lime text-forest" : tx.phase === "pending" ? "bg-cream-deep text-forest" : "bg-danger-soft text-danger";
  return (
    <div role="status" aria-live="polite" className={clsx("mt-5 flex flex-wrap items-center gap-2 rounded-[12px] px-4 py-3 text-[14px] font-medium", tone)}>
      {tx.phase === "pending" && (
        <>
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-forest border-t-transparent" aria-hidden="true" />
          Transaction pending — waiting for confirmation.{hashLine}
        </>
      )}
      {tx.phase === "success" && (
        <>
          <CheckIcon /> Claim confirmed in block {tx.block.toString()}:{" "}
          {tx.usdgReceived > 0n
            ? `${fmtUsdg(tx.usdgReceived + tx.usdgPaid)} USDG (from ${fmtEth(tx.ethPaid, 6)} ETH)`
            : `${fmtEth(tx.ethPaid, 6)} ETH${tx.usdgPaid > 0n ? ` + ${fmtUsdg(tx.usdgPaid)} USDG` : ""}`}{" "}
          paid to your wallet.{hashLine}
        </>
      )}
      {tx.phase === "reverted" && (
        <>
          <WarnIcon /> The transaction was mined but reverted. Nothing was paid; your rewards are intact.{hashLine}
        </>
      )}
      {tx.phase === "rejected" && (
        <>
          <WarnIcon /> Rejected in the wallet. Nothing was sent.
        </>
      )}
      {tx.phase === "blocked" && (
        <>
          <WarnIcon /> Not sent — the simulation failed. {tx.reason}
        </>
      )}
      {tx.phase === "error" && (
        <>
          <WarnIcon /> {tx.message}
        </>
      )}
      {tx.phase !== "pending" && (
        <button type="button" onClick={onReset} className="ml-auto text-[13px] underline">
          Dismiss
        </button>
      )}
    </div>
  );
}
