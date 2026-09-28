"use client";

import { useState, type FormEvent } from "react";
import { isAddress } from "viem";
import { explorerAddress } from "@/lib/chain";
import { bpsToMultiplier, fmtEth, fmtTokens, fmtUsdg, shortAddress } from "@/lib/format";
import { formatDuration, formatMultiplier } from "@/lib/rewards-math";
import { readFreshness, useChainNow, useHolder, useRewardsConfig, useTick } from "@/lib/hooks";
import { ExternalIcon } from "@/components/icons";

/**
 * Read-only position lookup: see what the contract says about any address
 * before connecting anything. Same `holderOf` call the dashboard uses.
 */
export function AddressLookup() {
  const [value, setValue] = useState("");
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);
  const holder = useHolder(address);
  const config = useRewardsConfig();
  const now = useChainNow();
  const tick = useTick();
  const fresh = readFreshness(holder, tick);

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!isAddress(v)) {
      setError("That is not a valid address.");
      setAddress(undefined);
      return;
    }
    setError(null);
    setAddress(v);
  }

  const h = holder.data;
  const epochSeconds = config.data ? Number(config.data.epochSeconds) : 0;
  const nextAt = h && config.data && h.nextMilestoneEpoch !== 0n ? Number(config.data.genesis) + Number(h.nextMilestoneEpoch) * epochSeconds : null;
  const remaining = nextAt !== null && now !== null ? Math.max(0, nextAt - now) : null;
  const link = address ? explorerAddress(address) : null;

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="lookup-heading">
      <h2 id="lookup-heading" className="display-md text-[22px]">
        Look up any address
      </h2>
      <p className="mt-2 text-[14px] text-moss">
        Read-only, no wallet needed. The same <code className="mono">holderOf</code> call the dashboard makes, for any address you
        paste.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="field mono flex-1"
          placeholder="0x…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label="Address to look up"
        />
        <button type="submit" className="btn btn-secondary btn-sm h-[46px]">
          Read position
        </button>
      </form>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}

      {address && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-moss">
            <span className="mono inline-flex items-center gap-1.5">
              {shortAddress(address, 6)}
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest underline">
                  explorer <ExternalIcon />
                </a>
              )}
            </span>
            <span className="num text-moss-soft">{holder.isError ? "read failed — retrying" : fresh.ageSeconds === null ? "reading…" : `as of ${fresh.ageSeconds}s ago`}</span>
          </div>
          {h && (
            <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Stat k="Balance" v={`${fmtTokens(h.balance)} STAYR`} />
              <Stat k="Multiplier" v={h.balance === 0n ? "—" : formatMultiplier(bpsToMultiplier(h.multiplierBps))} />
              <Stat k="Next milestone" v={h.balance === 0n ? "—" : h.nextMilestoneEpoch === 0n ? "top tier reached" : remaining === null ? "…" : `${formatMultiplier(bpsToMultiplier(h.nextMultiplierBps))} in ${formatDuration(remaining)}`} />
              <Stat k="Reward weight" v={fmtTokens(h.weight / 10_000n, { compact: true })} />
              <Stat k="Claimable" v={`${fmtEth(h.claimableEth, 6)} ETH${h.claimableUsdg > 0n ? ` + ${fmtUsdg(h.claimableUsdg)} USDG` : ""}`} />
            </dl>
          )}
          <p className="mt-4 text-[12.5px] text-moss-soft">Anyone can read a position. Only the wallet that holds the tokens can claim it.</p>
        </div>
      )}
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5">
      <dt className="text-[13.5px] text-moss">{k}</dt>
      <dd className="num text-right text-[14px] font-semibold text-forest">{v}</dd>
    </div>
  );
}
