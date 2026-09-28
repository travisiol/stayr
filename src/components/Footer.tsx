import Link from "next/link";
import { site } from "@/lib/site";
import { XIcon } from "@/components/icons";

export function Footer() {
  return (
    <footer className="pt-16">
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-10 sm:px-8">
      <div className="flex flex-col gap-8 border-t border-line pt-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <div className="wordmark text-[22px]">{site.wordmark}</div>
          <p className="mt-3 text-[14px] leading-relaxed text-moss">
            Trading fees belong to holders. Stay longer to increase your share. Built for Robinhood Chain.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-[14px] font-medium text-moss">
          <Link href="/#how-it-works" className="hover:text-forest">
            How it works
          </Link>
          <Link href="/#rewards" className="hover:text-forest">
            Rewards
          </Link>
          <Link href="/#transparency" className="hover:text-forest">
            Transparency
          </Link>
          <Link href="/app" className="hover:text-forest">
            Open app
          </Link>
          <a href={site.x} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-forest">
            <XIcon width={14} height={14} /> {site.xHandle}
          </a>
        </div>
      </div>
      <p className="mt-8 max-w-3xl text-[12.5px] leading-relaxed text-moss">
        STAYR is software, not an investment product. Rewards come only from fees that the STAYR contracts actually collect
        and only in proportion to holder weights; there is no fixed yield, no guaranteed return and no promise about the
        price of any token. Pool, aggregator and network fees are paid to other parties and never reach holders. Nothing
        on this site is financial advice.
      </p>
      </div>
    </footer>
  );
}
