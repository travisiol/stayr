"use client";

import { useEffect, useRef, useState } from "react";
import { useConnect, useConnectors } from "wagmi";
import type { Connector } from "wagmi";
import { activeChain } from "@/lib/chain";

/**
 * A plain list of the wallets the browser announces (EIP-6963) plus the
 * generic injected provider when nothing announces itself. No third-party
 * modal, so it stays in the brand.
 */
export function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending } = useConnect();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const announced = connectors.filter((c) => c.id !== "injected");
  const list = announced.length > 0 ? announced : connectors;
  const hasWallet = typeof window !== "undefined" && (announced.length > 0 || "ethereum" in window);

  async function pick(c: Connector) {
    setError(null);
    setBusy(c.uid);
    try {
      await connect({ connector: c, chainId: activeChain.id });
      onClose();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(92vw,420px)] rounded-[20px] border border-line bg-paper p-0 text-ink shadow-[0_30px_80px_-30px_rgba(18,38,28,0.5)] backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
      aria-label="Connect a wallet"
    >
      {/* Rendered only while open: the wallet list depends on the browser and must never be server-rendered. */}
      {open && (
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="display-md text-[22px]">Connect a wallet</h2>
            <p className="mt-1 text-[14px] text-moss">On {activeChain.name}.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm h-9 px-3" aria-label="Close">
            Close
          </button>
        </div>

        <p className="mt-4 rounded-[12px] bg-cream/70 p-3.5 text-[13px] leading-relaxed text-moss">
          Connecting only shares your public address with this page. No message to sign, no approval, no account. The one
          transaction this app can ever propose is <code className="mono">claim()</code> on the rewards contract.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {hasWallet ? (
            list.map((c) => (
              <button
                key={c.uid}
                type="button"
                disabled={isPending}
                onClick={() => pick(c)}
                className="flex h-14 items-center gap-3 rounded-[12px] border border-line bg-cream/60 px-4 text-left text-[15px] font-semibold text-forest transition-colors hover:bg-cream disabled:opacity-60"
              >
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" width={28} height={28} className="h-7 w-7 rounded-md" />
                ) : (
                  <span className="h-7 w-7 rounded-md bg-forest/10" aria-hidden="true" />
                )}
                <span className="flex-1">{c.name === "Injected" ? "Browser wallet" : c.name}</span>
                {busy === c.uid && <span className="text-[12px] font-medium text-moss">Confirm in wallet…</span>}
              </button>
            ))
          ) : (
            <div className="rounded-[12px] bg-cream/70 p-4 text-[14px] leading-relaxed text-moss">
              No wallet detected in this browser. Install a wallet extension that supports custom EVM networks, then reload
              this page.
            </div>
          )}
        </div>

        {error && <p className="mt-4 rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      </div>
      )}
    </dialog>
  );
}

export function describe(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|user denied|rejected the request|4001/i.test(msg)) return "Request rejected in the wallet.";
  if (/chain.*not.*(configured|added)|unrecognized chain|4902/i.test(msg)) return `Add ${activeChain.name} to your wallet, then try again.`;
  const short = msg.split("\n")[0];
  return short.length > 160 ? `${short.slice(0, 157)}…` : short;
}
