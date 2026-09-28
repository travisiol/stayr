"use client";

import { useState, type ReactNode } from "react";
import { economics } from "@/lib/site";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { formatDuration, formatMultiplier, illustrativeShare } from "@/lib/rewards-math";

const DURATIONS = [
  { label: "10 min", seconds: 10 * 60 },
  { label: "45 min", seconds: 45 * 60 },
  { label: "1 h", seconds: 60 * 60 },
  { label: "90 min", seconds: 90 * 60 },
  { label: "2 h", seconds: 2 * 60 * 60 },
  { label: "12 h", seconds: 12 * 60 * 60 },
  { label: "24 h", seconds: 24 * 60 * 60 },
  { label: "3 days", seconds: 3 * 24 * 60 * 60 },
];

/**
 * The illustrative example. Everything on this card is an input the visitor
 * controls; nothing is read from the chain, and it says so.
 */
export function Example() {
  const [balance, setBalance] = useState(10_000);
  const [durationIndex, setDurationIndex] = useState(3);
  const [fees, setFees] = useState(1);
  const [others, setOthers] = useState(5_000_000);

  const heldSeconds = DURATIONS[durationIndex].seconds;
  const r = illustrativeShare({ balance, heldSeconds, feesDistributed: fees, othersWeight: others });

  return (
    <section id="rewards" className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <div className="reveal max-w-2xl">
        <p className="eyebrow">Rewards</p>
        <h2 className="display-md mt-3 text-[clamp(34px,5vw,56px)]">Your share, in the open.</h2>
        <p className="lede mt-4 text-[17px]">
          Move the inputs and watch the arithmetic. It is the same rule the contract applies: weight is balance times
          multiplier, and your share is your weight over everyone&apos;s.
        </p>
      </div>

      <div className="reveal card mt-10 grid gap-0 overflow-hidden md:grid-cols-[1fr_1fr]">
        <div className="border-b border-line p-6 sm:p-8 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between">
            <span className="chip">Illustrative example</span>
            <span className="text-[12px] font-medium text-moss-soft">Not live protocol data</span>
          </div>

          <Field label="Your token balance" value={`${fmtNumber(balance)} STAYR`}>
            <input
              type="range"
              className="range"
              min={100}
              max={1_000_000}
              step={100}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              aria-label="Token balance"
            />
          </Field>

          <Field label="Holding duration, without selling" value={DURATIONS[durationIndex].label}>
            <input
              type="range"
              className="range"
              min={0}
              max={DURATIONS.length - 1}
              step={1}
              value={durationIndex}
              onChange={(e) => setDurationIndex(Number(e.target.value))}
              aria-label="Holding duration"
            />
          </Field>

          <Field label="Hypothetical fees distributed over the period" value={`${fees.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETH`}>
            <input
              type="range"
              className="range"
              min={0.05}
              max={20}
              step={0.05}
              value={fees}
              onChange={(e) => setFees(Number(e.target.value))}
              aria-label="Fees distributed"
            />
          </Field>

          <Field label="Other holders' total weighted balance" value={`${fmtNumber(others)}`}>
            <input
              type="range"
              className="range"
              min={100_000}
              max={100_000_000}
              step={100_000}
              value={others}
              onChange={(e) => setOthers(Number(e.target.value))}
              aria-label="Other holders' total weighted balance"
            />
          </Field>
        </div>

        <div className="flex flex-col p-6 sm:p-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-7">
            <Stat label="Your multiplier" value={formatMultiplier(r.multiplier)} big />
            <Stat label="Your reward weight" value={fmtNumber(r.weight)} big />
            <Stat label="Your share of weight" value={fmtPercent(r.share, 3)} />
            <Stat label="Illustrative reward" value={`${r.reward.toLocaleString("en-US", { maximumFractionDigits: 5 })} ETH`} />
          </dl>
          <div className="mt-auto pt-8">
            <div className="h-2 w-full overflow-hidden rounded-full bg-cream-deep" aria-hidden="true">
              <div className="h-full rounded-full bg-lime-deep transition-[width] duration-300" style={{ width: `${Math.max(0.5, r.share * 100)}%` }} />
            </div>
            <p className="mt-2 text-[12.5px] text-moss">
              {fmtNumber(r.weight)} of {fmtNumber(r.totalWeight)} total weight after holding {formatDuration(heldSeconds, { compact: true })}.
            </p>
          </div>
          <details className="mt-6 rounded-[12px] bg-cream/70 p-4 text-[13px] leading-relaxed text-moss">
            <summary className="cursor-pointer font-semibold text-forest">Assumptions</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Multiplier schedule: {formatMultiplier(economics.baseMultiplier)} at purchase,{" "}
                {economics.milestones.map((m) => `${formatMultiplier(m.multiplier)} after ${m.label}`).join(", ")}. The contract
                credits a milestone at the next one-minute epoch boundary; this example uses continuous time.
              </li>
              <li>Other holders&apos; weight stays constant over the period, and nobody sells or crosses a milestone.</li>
              <li>&ldquo;Fees distributed&rdquo; is what the vault allocates, after fee tokens have been sold for ETH.</li>
              <li>No gas, no swap costs, no rounding. Real allocations are split by the weights in force at each allocation.</li>
            </ul>
          </details>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <label className="mt-7 block">
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-[14px] font-medium text-moss">{label}</span>
        <span className="num text-[15px] font-semibold text-forest">{value}</span>
      </span>
      <span className="mt-3 block">{children}</span>
    </label>
  );
}

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <dt className="text-[13px] font-medium text-moss">{label}</dt>
      <dd className={`num mt-1 font-semibold text-forest ${big ? "display-md text-[clamp(32px,4vw,44px)]" : "text-[22px]"}`}>{value}</dd>
    </div>
  );
}
