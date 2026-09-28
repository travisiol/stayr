"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { explorerAddress } from "@/lib/chain";
import { contracts, deployed, site } from "@/lib/site";
import { shortAddress } from "@/lib/format";
import { CheckIcon, ExternalIcon, WarnIcon } from "@/components/icons";

const noop = () => () => {};
function useHost(): string | null {
  return useSyncExternalStore(noop, () => window.location.host, () => null);
}

/**
 * The facts a careful user checks before connecting: which host this is,
 * which contract the app talks to, and what it will never ask for.
 */
export function TrustBar() {
  const host = useHost();
  const official = host !== null && (host === site.officialHost || host === `www.${site.officialHost}`);
  const local = host !== null && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const link = contracts.rewards ? explorerAddress(contracts.rewards) : null;

  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[13px] text-moss">
      {host === null ? (
        <span className="chip">Checking host…</span>
      ) : official ? (
        <span className="chip chip-lime">
          <CheckIcon width={13} height={13} /> Official site · {site.officialHost}
        </span>
      ) : local ? (
        <span className="chip">Local build · {host}</span>
      ) : (
        <span className="chip chip-danger">
          <WarnIcon width={13} height={13} /> Unofficial host: {host} — the official app is at https://{site.officialHost}
        </span>
      )}

      {deployed && contracts.rewards ? (
        <span className="inline-flex items-center gap-1.5">
          Rewards contract{" "}
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="mono inline-flex items-center gap-1 text-forest underline">
              {shortAddress(contracts.rewards, 6)} <ExternalIcon />
            </a>
          ) : (
            <span className="mono text-forest">{shortAddress(contracts.rewards, 6)}</span>
          )}
          {contracts.verified ? <span className="chip chip-lime">source verified</span> : <span className="chip">verification pending</span>}
        </span>
      ) : (
        <span className="chip">No contract deployed</span>
      )}

      <span className="inline-flex items-center gap-1.5">
        <CheckIcon width={13} height={13} className="text-forest" /> No token approvals · no message signatures · one function: <code className="mono">claim()</code>
      </span>

      <Link href="/#verify" className="ml-auto font-medium text-forest underline">
        How to verify
      </Link>
    </div>
  );
}
