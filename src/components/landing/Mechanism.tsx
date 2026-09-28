import { ArrowDown, ArrowRight } from "@/components/icons";
import { MilestoneTimeline } from "@/components/landing/MilestoneTimeline";
import { economics } from "@/lib/site";

const STEPS = [
  {
    n: "01",
    title: "Trading fees",
    body: `Every STAYR trade against its Uniswap v2 pools pays a fixed fee — ${economics.feeBps / 100}% in the current configuration — charged by the token itself, so no venue has to cooperate.`,
  },
  {
    n: "02",
    title: "Rewards contract",
    body: "Fees land in a vault with no owner. Anyone can sell them for ETH in small, capped batches, and the ETH is allocated to the holder weights in force at that moment.",
  },
  {
    n: "03",
    title: "Eligible holders",
    body: "Every wallet holding STAYR earns in proportion to balance × multiplier, and can claim at any time — in ETH, or swapped to USDG on claim.",
  },
];

export function Mechanism() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <div className="reveal max-w-2xl">
        <p className="eyebrow">How it works</p>
        <h2 className="display-md mt-3 text-[clamp(34px,5vw,56px)]">Fees flow to the people who stay.</h2>
      </div>

      <ol className="reveal mt-12 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        {STEPS.map((s, i) => (
          <li key={s.n} className="contents">
            <div className="card flex flex-col p-6 sm:p-7">
              <span className="num text-[13px] font-semibold text-moss-soft">{s.n}</span>
              <h3 className="display-md mt-3 text-[24px]">{s.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-moss">{s.body}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex items-center justify-center text-forest/60" aria-hidden="true">
                <ArrowRight className="hidden md:block" width={26} height={26} />
                <ArrowDown className="md:hidden" width={22} height={22} />
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="reveal card mt-16 px-5 pb-8 pt-8 sm:px-10 sm:pt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Holding milestones</p>
            <h3 className="display-md mt-2 text-[clamp(24px,3vw,34px)]">Hold, and your weight grows.</h3>
          </div>
          <p className="text-[14px] text-moss">Sell, and the clock resets to zero.</p>
        </div>
        <div className="mt-12">
          <MilestoneTimeline />
        </div>
        <div className="mt-8 grid gap-4 border-t border-line pt-6 text-[14px] leading-relaxed text-moss md:grid-cols-2">
          <p>
            A multiplier increases your <strong className="font-semibold text-forest">relative reward weight</strong>. It is
            not a yield and not a fixed share of total fees: what you receive is your weight divided by everyone&apos;s
            weight, applied to whatever fees are actually distributed.
          </p>
          <p>
            Weights are read at the moment fees are allocated. Crossing a milestone raises your weight from then on — it
            never re-scores what was already distributed. Milestones take effect at the next one-minute epoch boundary.
          </p>
        </div>
      </div>
    </section>
  );
}
