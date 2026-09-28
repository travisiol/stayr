"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { activeChain, explorerAddress } from "@/lib/chain";
import { contracts, deployed } from "@/lib/site";
import { fmtEth, fmtPercent, fmtTokens, fmtUsdg, shortAddress } from "@/lib/format";
import { formatDuration } from "@/lib/rewards-math";
import { readFreshness, useChainNow, useHolder, useProtocolStats, useRewardsConfig, useTick, useTokenBalance, useTotalSupply } from "@/lib/hooks";
import { RewardPanel } from "@/components/app/RewardPanel";
import { ClaimHistory } from "@/components/app/ClaimHistory";
import { WalletButton } from "@/components/app/WalletButton";
import { TrustBar } from "@/components/app/TrustBar";
import { AddressLookup } from "@/components/app/AddressLookup";
import { ExternalIcon, WarnIcon } from "@/components/icons";

export function Dashboard() {
  const { address, isConnected, chainId } = useConnection();
  const queryClient = useQueryClient();
  const now = useChainNow();
  const tick = useTick();
  const config = useRewardsConfig();
  const stats = useProtocolStats();
  const holder = useHolder(address);
  const balance = useTokenBalance(address);
  const supply = useTotalSupply();

  if (!deployed) return <NotDeployed />;

  const wrongNetwork = isConnected && chainId !== activeChain.id;
  const fresh = readFreshness(holder, tick);

  let main: ReactNode;
  if (!isConnected || !address) {
    main = (
      <StatePanel title="Connect a wallet to see your rewards" body="Your claimable rewards, multiplier and time to the next milestone are read straight from the rewards contract for the connected address. Nothing is stored anywhere else.">
        <WalletButton />
      </StatePanel>
    );
  } else if (wrongNetwork) {
    main = (
      <StatePanel tone="warn" title={`Wrong network`} body={`This wallet is on another network. STAYR lives on ${activeChain.name} (chain id ${activeChain.id}). Switch to continue.`}>
        <WalletButton />
      </StatePanel>
    );
  } else if (holder.data === undefined && holder.isError) {
    main = (
      <StatePanel tone="warn" title="Could not read the contract" body="The RPC did not answer. The page keeps retrying every few seconds; nothing you see here is invented in the meantime.">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => holder.refetch()}>
          Retry now
        </button>
      </StatePanel>
    );
  } else if (holder.data === undefined || config.data === undefined) {
    main = <Skeleton />;
  } else if (holder.data.balance === 0n && holder.data.claimableEth === 0n && holder.data.claimableUsdg === 0n) {
    main = (
      <StatePanel title="No STAYR in this wallet" body="Rewards start with your first purchase: the clock starts at the buy, and every allocation after that counts your balance × multiplier.">
        {contracts.tradeUrl ? (
          <a href={contracts.tradeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
            Trade STAYR <ExternalIcon />
          </a>
        ) : (
          <span className="chip">Trading link not configured</span>
        )}
      </StatePanel>
    );
  } else {
    main = (
      <RewardPanel
        address={address}
        holder={holder.data}
        config={config.data}
        now={now}
        ageSeconds={fresh.ageSeconds}
        stale={fresh.stale}
        onClaimed={() => {
          holder.refetch();
          stats.refetch();
          balance.refetch();
          queryClient.invalidateQueries({ queryKey: ["stayr-claims"] });
        }}
      />
    );
  }

  const h = holder.data;
  const s = stats.data;
  const heldSeconds =
    h && config.data && h.balance > 0n && now !== null ? Math.max(0, now - (Number(config.data.genesis) + Number(h.startEpoch) * Number(config.data.epochSeconds))) : null;
  const share = h && s && s.totalWeightNow > 0n ? Number((h.weight * 1_000_000n) / s.totalWeightNow) / 1_000_000 : null;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your rewards</p>
          <h1 className="display-md mt-2 text-[clamp(30px,4vw,44px)]">
            {address && isConnected ? shortAddress(address, 6) : "Not connected"}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-moss">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" />
          {activeChain.name}
          {contracts.rewards && (
            <a href={explorerAddress(contracts.rewards) ?? "#"} target="_blank" rel="noopener noreferrer" className="mono ml-2 inline-flex items-center gap-1 underline">
              vault {shortAddress(contracts.rewards)} <ExternalIcon />
            </a>
          )}
        </div>
      </div>

      <div className="mt-6">
        <TrustBar />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          {main}
          {isConnected && address && !wrongNetwork ? <ClaimHistory address={address} /> : <AddressLookup />}
        </div>

        <aside className="flex flex-col gap-6">
          <section className="card p-6" aria-labelledby="position-heading">
            <h2 id="position-heading" className="display-md text-[20px]">
              Your position
            </h2>
            <dl className="mt-4 divide-y divide-line">
              <Row k="Wallet balance" v={balance.data !== undefined ? `${fmtTokens(balance.data)} STAYR` : isConnected ? "…" : "—"} />
              <Row k="Holding age" v={heldSeconds !== null ? formatDuration(heldSeconds) : "—"} hint={h && h.balance > 0n ? "balance-weighted since your last reset" : undefined} />
              <Row k="Reward weight" v={h ? fmtTokens(h.weight / 10_000n, { compact: true }) : "—"} hint="balance × multiplier" />
              <Row k="Share of eligible weighted supply" v={share !== null ? fmtPercent(share, 3) : "—"} />
            </dl>
          </section>

          <section className="card p-6" aria-labelledby="protocol-heading">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="protocol-heading" className="display-md text-[20px]">
                Protocol
              </h2>
              {stats.isError && (
                <span className="chip chip-danger">
                  <WarnIcon width={13} height={13} /> stale
                </span>
              )}
            </div>
            <dl className="mt-4 divide-y divide-line">
              <Row k="ETH allocated to holders" v={s ? `${fmtEth(s.totalEthAllocated, 5)} ETH` : "…"} />
              <Row k="ETH claimed so far" v={s ? `${fmtEth(s.totalEthClaimed, 5)} ETH` : "…"} />
              <Row k="Awaiting allocation" v={s ? `${fmtEth(s.unallocatedEth, 5)} ETH${s.unallocatedUsdg > 0n ? ` + ${fmtUsdg(s.unallocatedUsdg)} USDG` : ""}` : "…"} hint="ETH in the vault not yet split; any transfer or claim allocates it" />
              <Row k="Fee tokens awaiting harvest" v={s ? `${fmtTokens(s.tokenFeeBalance, { compact: true })} STAYR` : "…"} hint="anyone may harvest, within the cap and cooldown" />
              <Row k="Eligible weighted supply" v={s ? fmtTokens(s.totalWeightNow / 10_000n, { compact: true }) : "…"} hint={supply.data ? `of ${fmtTokens(supply.data, { compact: true })} STAYR total` : undefined} />
              <Row k="Epoch" v={s ? `#${s.currentEpoch}` : "…"} hint={config.data ? `${config.data.epochSeconds}s each` : undefined} />
            </dl>
          </section>

          <p className="px-1 text-[12.5px] leading-relaxed text-moss-soft">
            Figures are read from the contracts every 10 seconds and labelled with their age. The countdown runs on the
            chain&apos;s clock. Nothing here is projected or estimated.{" "}
            <Link href="/#transparency" className="underline">
              How it works
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-[13.5px] text-moss">
        {k}
        {hint && <span className="block text-[11.5px] text-moss-soft">{hint}</span>}
      </dt>
      <dd className="num shrink-0 text-right text-[14px] font-semibold text-forest">{v}</dd>
    </div>
  );
}

function StatePanel({ title, body, children, tone = "neutral" }: { title: string; body: string; children?: ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <section className="card p-6 sm:p-8">
      {tone === "warn" && (
        <span className="chip chip-danger mb-3">
          <WarnIcon width={13} height={13} /> Attention
        </span>
      )}
      <h2 className="display-md text-[clamp(24px,3vw,32px)]">{title}</h2>
      <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-moss">{body}</p>
      {children && <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>}
    </section>
  );
}

function Skeleton() {
  return (
    <section className="card p-6 sm:p-8" aria-busy="true" aria-label="Loading rewards">
      <div className="h-4 w-32 animate-pulse rounded bg-cream-deep" />
      <div className="mt-3 h-14 w-64 animate-pulse rounded bg-cream-deep" />
      <div className="mt-8 h-4 w-40 animate-pulse rounded bg-cream-deep" />
      <div className="mt-3 h-2.5 w-full animate-pulse rounded bg-cream-deep" />
      <p className="mt-6 text-[13px] text-moss">Reading the rewards contract…</p>
    </section>
  );
}

function NotDeployed() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
      <StatePanel title="STAYR is not deployed yet" body={`The app is wired to the rewards contract and shows nothing until it exists on ${activeChain.name}. Once deployed, the token and vault addresses appear on the landing page and every figure here is read live from the chain.`}>
        <Link href="/#transparency" className="btn btn-secondary btn-sm">
          Read how it works
        </Link>
      </StatePanel>
    </div>
  );
}
