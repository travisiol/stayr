import Link from "next/link";
import { Hourglass } from "@/components/Hourglass";
import { ArrowRight } from "@/components/icons";

/**
 * The hourglass stands on the dunes of the brand banner: the text-free part
 * of that render is the ground of the hero, dissolving into the cream page
 * along its top and bottom edges. The sand lives here and nowhere else.
 */
const GROUND_MASK = "linear-gradient(to bottom, transparent 0%, black 56%, black 80%, transparent 100%)";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] sm:h-[52%]"
        style={{ maskImage: GROUND_MASK, WebkitMaskImage: GROUND_MASK }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- brand render, served verbatim */}
        <img src="/brand/dunes.png" alt="" className="h-full w-full object-cover object-[50%_35%]" draggable={false} />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <div className="grid min-h-[min(calc(100svh-72px),820px)] items-center gap-10 py-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-6 lg:py-8">
          <div className="fade-up">
            <h1 className="display text-[clamp(64px,11.5vw,148px)]">Patience pays.</h1>
            <p className="lede mt-7 max-w-[34ch] text-[clamp(18px,1.6vw,22px)]">
              Trading fees belong to holders. Stay longer to increase your share.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/app" className="btn btn-primary">
                Explore rewards
                <ArrowRight />
              </Link>
              <Link href="#how-it-works" className="btn btn-secondary">
                How it works
              </Link>
            </div>
            <p className="mt-7 flex items-center gap-2 text-[13px] font-medium text-moss">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" />
              Built for Robinhood Chain.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Hourglass priority className="w-[min(68vw,300px)] sm:w-[min(48vw,380px)] lg:w-[min(38vw,520px)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
