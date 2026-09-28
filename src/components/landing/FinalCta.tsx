import Link from "next/link";
import { site } from "@/lib/site";
import { ArrowRight, XIcon } from "@/components/icons";

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-5 pt-4 sm:px-8">
      <div className="reveal card-forest relative overflow-hidden px-6 py-14 text-center sm:px-12 sm:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-20"
          style={{ background: "radial-gradient(closest-side, var(--lime), transparent)" }}
        />
        <h2 className="display text-[clamp(40px,6.5vw,84px)] !text-cream">Your patience should count.</h2>
        <p className="mx-auto mt-5 max-w-[42ch] text-[17px] leading-relaxed text-cream/80">
          Open the app to see your multiplier, your weight and what you can claim — or follow along on X.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/app" className="btn btn-lime">
            Open app
            <ArrowRight />
          </Link>
          <a
            href={site.x}
            target="_blank"
            rel="noopener noreferrer"
            className="btn text-cream shadow-[inset_0_0_0_1.5px_rgba(245,243,233,0.35)] hover:bg-cream/10"
          >
            <XIcon /> {site.xHandle}
          </a>
        </div>
      </div>
    </section>
  );
}
