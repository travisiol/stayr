import { contracts, deployed, economics } from "@/lib/site";
import { activeChain, explorerAddress } from "@/lib/chain";
import { ExternalIcon } from "@/components/icons";

const STEPS = [
  {
    title: "Collected",
    body: `The STAYR token charges ${economics.feeBps / 100}% on every trade that touches one of its Uniswap v2 pools and sends it, in STAYR, to the rewards vault. Wallet-to-wallet transfers are free. The pool's own 0.30% fee, aggregator fees and gas go to other parties — STAYR cannot capture those and does not claim to.`,
  },
  {
    title: "Held",
    body: "The vault has no owner. Anyone can call harvest to sell collected STAYR for ETH — at most 0.5% of the pool's reserve per call, ten minutes apart — and the ETH is allocated on the spot to the holder weights in force. ETH or USDG sent directly to the vault is allocated the same way.",
  },
  {
    title: "Claimed",
    body: "Each wallet claims its own accrued rewards whenever it likes: ETH and USDG as accrued, or the ETH part swapped to USDG on Uniswap at claim time with a minimum the wallet sets. There is no fiat withdrawal and no custodian.",
  },
];

function Row({ label, address, note }: { label: string; address: string | null | undefined; note?: string }) {
  const href = address ? explorerAddress(address, activeChain) : null;
  return (
    <div className="grid gap-1 border-t border-line py-4 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-6">
      <div className="text-[14px] font-medium text-moss">{label}</div>
      <div className="min-w-0">
        {address ? (
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="mono inline-flex max-w-full items-center gap-1.5 break-all text-forest hover:underline">
              {address} <ExternalIcon />
            </a>
          ) : (
            <span className="mono break-all text-forest">{address}</span>
          )
        ) : (
          <span className="chip">Not deployed yet</span>
        )}
        {note && <div className="mt-1 text-[12.5px] text-moss-soft">{note}</div>}
      </div>
    </div>
  );
}

export function Transparency() {
  const v = contracts.venue;
  return (
    <section id="transparency" className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <div className="reveal max-w-2xl">
        <p className="eyebrow">Ownership and transparency</p>
        <h2 className="display-md mt-3 text-[clamp(34px,5vw,56px)]">Nothing to take on trust.</h2>
      </div>

      <div className="reveal mt-12 grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.title} className="card p-6 sm:p-7">
            <h3 className="display-md text-[22px]">{s.title}</h3>
            <p className="mt-3 text-[14.5px] leading-relaxed text-moss">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="reveal card mt-6 p-6 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="display-md text-[22px]">Contracts on {contracts.chainName}</h3>
          {deployed ? (
            <span className={contracts.verified ? "chip chip-lime" : "chip"}>{contracts.verified ? "Source verified" : "Source verification pending"}</span>
          ) : (
            <span className="chip">Status: not deployed</span>
          )}
        </div>
        {!deployed && (
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-moss">
            STAYR has not been deployed yet. The token and vault addresses, the explorer links, the verified source and
            the live figures appear here once they exist — nothing is shown before then.
          </p>
        )}
        <div className="mt-4">
          <Row label="STAYR token" address={contracts.token} note="ERC-20. Charges the pool fee and reports every transfer to the vault." />
          <Row label="Rewards vault" address={contracts.rewards} note="Deploys the token, holds fees, harvests, allocates and pays claims. No owner." />
          <Row label="Uniswap v2 factory" address={v.factory} note="Where the STAYR pools are looked up. Verified on chain." />
          <Row label="Uniswap v2 router" address={v.router} note="Used for the harvest sale and the claim-time ETH → USDG swap. Immutable in the vault." />
          <Row label="WETH" address={v.weth} />
          <Row label="USDG" address={v.usdg} note="Global Dollar, the supported stablecoin (6 decimals)." />
        </div>
      </div>

      <div className="reveal mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-6">
          <h4 className="text-[13px] font-semibold uppercase tracking-wide text-moss">Nobody can</h4>
          <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-ink">
            <li>Change the fee, the milestone schedule or the epoch length.</li>
            <li>Replace the router, the factory, WETH or USDG.</li>
            <li>Move, sweep or redirect holder rewards.</li>
            <li>Mint, burn, pause, blacklist or upgrade.</li>
          </ul>
        </div>
        <div className="card p-6">
          <h4 className="text-[13px] font-semibold uppercase tracking-wide text-moss">Anyone can</h4>
          <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-ink">
            <li>Harvest fee tokens to ETH, within the cap and the cooldown.</li>
            <li>Advance the weight schedule and trigger an allocation.</li>
            <li>Register another Uniswap v2 pair of STAYR — only what the factory reports.</li>
            <li>Send ETH or USDG to the vault; it goes to holders.</li>
          </ul>
        </div>
        <div className="card p-6">
          <h4 className="text-[13px] font-semibold uppercase tracking-wide text-moss">What remains</h4>
          <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-ink">
            <li>The deployer wallet receives the initial supply and adds liquidity like any other holder.</li>
            <li>Uniswap governance controls the pools&apos; own fee switch, not STAYR&apos;s fee.</li>
            <li>USDG is issued by Paxos and can be paused or frozen under its terms.</li>
            <li>Harvest sales move the STAYR price a little each time; the cap bounds it.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
