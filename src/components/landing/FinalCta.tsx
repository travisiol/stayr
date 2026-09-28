import Link from "next/link";
import { site } from "@/lib/site";
import { ArrowRight, XIcon } from "@/components/icons";

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-5 pt-4 sm:px-8">
      {/* the closing image is the brand's own banner: dunes, the broken hourglass, the line */}
      <div className="reveal card overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- brand render, served verbatim */}
        <img
          src="/brand/banner-dunes.png"
          alt="Patience pays. Trading fees belong to holders. A broken hourglass lies on cream dunes."
          width={1600}
          height={533}
          className="hidden h-auto w-full md:block"
          loading="lazy"
        />
        {/* on phones the banner's baked-in line would be unreadable: show its right side, say the line in HTML */}
        <div className="relative md:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- brand render, served verbatim */}
          <img src="/brand/banner-dunes.png" alt="" className="h-[240px] w-full object-cover object-[82%_50%]" loading="lazy" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-paper to-transparent px-5 pb-5 pt-16">
            <p className="display text-[34px] !text-forest">Patience pays.</p>
            <p className="text-[15px] font-medium text-moss">Trading fees belong to holders.</p>
          </div>
        </div>
        <div className="flex flex-col gap-4 px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h2 className="display-md text-[clamp(22px,2.6vw,30px)]">Your patience should count.</h2>
            <p className="mt-1 text-[14.5px] text-moss">See your multiplier, your weight and what you can claim — or follow along on X.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/app" className="btn btn-primary">
              Open app
              <ArrowRight />
            </Link>
            <a href={site.x} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              <XIcon /> {site.xHandle}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
