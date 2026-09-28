"use client";

import { activeChain, explorerAddress } from "@/lib/chain";
import { contracts, deployed, site } from "@/lib/site";
import { fmtEth, fmtTokens, fmtUsdg } from "@/lib/format";
import { readFreshness, useProtocolStats, useTick } from "@/lib/hooks";
import { ExternalIcon, WarnIcon } from "@/components/icons";

const RISKS = [
  "The contracts are not audited. They are tested, and the source is meant to be verified on the explorer, but nobody independent has reviewed them yet.",
  "Rewards exist only if people trade STAYR on its pools. No trades, no fees, nothing to claim.",
  "The token has a price and a pool, and both can go to zero. Rewards do not protect the value of what you hold.",
  "Every harvest sells collected STAYR into the pool. It is capped and rate-limited, and it still adds sell pressure.",
  "USDG is issued by Paxos and can be paused or frozen under its terms. ETH claims do not depend on it.",
  "The deployer wallet holds the unsold supply and earns like any holder. It has no special power over the contracts.",
  "Nothing on this site is investment advice.",
];

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[13.5px] text-moss">{k}</dt>
      <dd className="num text-right text-[14px] font-semibold text-forest">{v}</dd>
    </div>
  );
}

export function Verify() {
  const stats = useProtocolStats();
  const tick = useTick();
  const fresh = readFreshness(stats, tick);
  const s = stats.data;
  const vaultLink = contracts.rewards ? explorerAddress(contracts.rewards) : null;
  const tokenLink = contracts.token ? explorerAddress(contracts.token) : null;

  return (
    <section id="verify" className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-5 pb-8 pt-4 sm:px-8">
      <div className="reveal max-w-2xl">
        <p className="eyebrow">Verify it yourself</p>
        <h2 className="display-md mt-3 text-[clamp(30px,4.5vw,48px)]">Don&apos;t trust this page. Check the chain.</h2>
        <p className="lede mt-4 text-[17px]">
          Everything this site shows is read from two contracts anyone can query. Here is what they say right now, how to
          read them without us, and what can go wrong.
        </p>
      </div>

      <div className="reveal mt-10 grid gap-4 lg:grid-cols-3">
        <div className="card p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="display-md text-[20px]">Live from the contract</h3>
            {deployed && s ? (
              fresh.stale ? (
                <span className="chip chip-danger">
                  <WarnIcon width={13} height={13} /> stale
                </span>
              ) : (
                <span className="num text-[12px] text-moss-soft">{fresh.ageSeconds === null ? "" : `${fresh.ageSeconds}s ago`}</span>
              )
            ) : null}
          </div>
          {!deployed ? (
            <p className="mt-4 text-[14px] leading-relaxed text-moss">
              <span className="chip mb-2">Not deployed</span>
              <br />
              Nothing to read yet. These figures come from <code className="mono">stats()</code> on the rewards contract and appear
              the moment it exists on {activeChain.name}.
            </p>
          ) : !s ? (
            <p className="mt-4 text-[14px] text-moss">{stats.isError ? "The RPC did not answer; retrying." : "Reading…"}</p>
          ) : (
            <dl className="mt-3 divide-y divide-line">
              <Row k="ETH allocated to holders" v={`${fmtEth(s.totalEthAllocated, 5)} ETH`} />
              <Row k="ETH claimed by holders" v={`${fmtEth(s.totalEthClaimed, 5)} ETH`} />
              <Row k="Awaiting allocation" v={`${fmtEth(s.unallocatedEth, 5)} ETH${s.unallocatedUsdg > 0n ? ` + ${fmtUsdg(s.unallocatedUsdg)} USDG` : ""}`} />
              <Row k="Fee tokens awaiting harvest" v={`${fmtTokens(s.tokenFeeBalance, { compact: true })} STAYR`} />
              <Row k="Eligible weighted supply" v={fmtTokens(s.totalWeightNow / 10_000n, { compact: true })} />
              <Row k="Allocations so far" v={String(s.checkpointCount)} />
              <Row k="Epoch" v={`#${s.currentEpoch}`} />
            </dl>
          )}
          {deployed && (
            <p className="mt-4 text-[12.5px] text-moss-soft">
              Read every 10 seconds from {activeChain.name} through this site&apos;s own RPC relay. Same numbers as the explorer.
            </p>
          )}
        </div>

        <div className="card p-6">
          <h3 className="display-md text-[20px]">Check without this site</h3>
          <ol className="mt-4 space-y-4 text-[14px] leading-relaxed text-ink">
            <li className="flex gap-3">
              <span className="num shrink-0 font-semibold text-moss-soft">1</span>
              <span>
                Open the rewards vault on the explorer
                {vaultLink ? (
                  <>
                    {" "}
                    <a href={vaultLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest underline">
                      here <ExternalIcon />
                    </a>
                  </>
                ) : (
                  <> (link appears once deployed)</>
                )}
                , go to <em>Read contract</em> and call <code className="mono">holderOf(your address)</code>: your balance, multiplier,
                weight and claimable amounts — the exact figures the app shows.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="num shrink-0 font-semibold text-moss-soft">2</span>
              <span>
                Call <code className="mono">config()</code> for the fee, the milestone schedule, the harvest cap and cooldown. They are
                constructor values; there is no function that changes them. Check the token
                {tokenLink ? (
                  <>
                    {" "}
                    <a href={tokenLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest underline">
                      here <ExternalIcon />
                    </a>
                  </>
                ) : null}
                : no <code className="mono">owner()</code>, no mint, no pause.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="num shrink-0 font-semibold text-moss-soft">3</span>
              <span>
                To claim without this site, use <em>Write contract</em> → <code className="mono">claim(0, 0, 0)</code> from the wallet
                that holds the tokens. ETH arrives in that wallet. This page is a convenience, never a gatekeeper.
              </span>
            </li>
          </ol>
          <p className="mt-4 text-[12.5px] text-moss-soft">
            Source verification on the explorer: {contracts.verified ? "done — the bytecode matches the published source." : deployed ? "pending." : "after deployment."}
            {site.repo && (
              <>
                {" "}
                Source code:{" "}
                <a href={site.repo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest underline">
                  repository <ExternalIcon />
                </a>
                .
              </>
            )}
          </p>
        </div>

        <div className="card p-6">
          <h3 className="display-md text-[20px]">Risks, plainly</h3>
          <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-ink">
            {RISKS.map((r) => (
              <li key={r} className="flex gap-2.5">
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-forest/60" aria-hidden="true" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="reveal card mt-4 p-6">
        <h3 className="display-md text-[20px]">What this site does with your wallet</h3>
        <div className="mt-3 grid gap-4 text-[14px] leading-relaxed text-ink md:grid-cols-3">
          <p>
            <strong className="font-semibold text-forest">Connecting</strong> shares your public address with this page, nothing
            else. There is no login, no message to sign, no account.
          </p>
          <p>
            <strong className="font-semibold text-forest">Claiming</strong> is one transaction to the rewards vault,{" "}
            <code className="mono">claim(payout, minUsdgOut, deadline)</code>. It sends no ETH and needs no token approval; the wallet
            shows the vault address and you can compare it with the one on this page.
          </p>
          <p>
            <strong className="font-semibold text-forest">Nothing else</strong> is ever requested — no approvals, no permits, no
            signatures, no third-party scripts. Fonts and images are served from this domain.
          </p>
        </div>
      </div>
    </section>
  );
}
