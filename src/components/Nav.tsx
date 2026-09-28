"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { clsx } from "clsx";
import { site } from "@/lib/site";
import { XIcon } from "@/components/icons";

function subscribeScroll(cb: () => void) {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
}

/** Sticky, light, and only draws a background once the page has moved. */
export function Nav({ action }: { action?: ReactNode }) {
  const scrolled = useSyncExternalStore(subscribeScroll, () => window.scrollY > 8, () => false);

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300",
        scrolled ? "bg-cream/85 shadow-[0_1px_0_var(--line)] backdrop-blur-md" : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-[72px] max-w-[1200px] items-center gap-6 px-5 sm:px-8" aria-label="Main">
        <Link href="/" className="flex items-center gap-2.5" aria-label="STAYR home">
          <Image src="/brand/hourglass-720.png" alt="" width={25} height={30} priority />
          <span className="wordmark text-[24px]">{site.wordmark}</span>
        </Link>

        <div className="hidden items-center gap-7 text-[15px] font-medium text-moss md:flex md:pl-6">
          <Link href="/#how-it-works" className="transition-colors hover:text-forest">
            How it works
          </Link>
          <Link href="/#rewards" className="transition-colors hover:text-forest">
            Rewards
          </Link>
          <Link href="/#transparency" className="transition-colors hover:text-forest">
            Transparency
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <a
            href={site.x}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center gap-2 rounded-[10px] px-2.5 text-[14px] font-medium text-forest transition-colors hover:bg-forest/8"
            aria-label={`STAYR on X (${site.xHandle})`}
          >
            <XIcon />
            <span className="hidden sm:inline">{site.xHandle}</span>
          </a>
          {action ?? (
            <Link href="/app" className="btn btn-primary btn-sm">
              Open app
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
