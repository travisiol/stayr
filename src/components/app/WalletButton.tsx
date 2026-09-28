"use client";

import { useState } from "react";
import { useConnection, useDisconnect, useSwitchChain } from "wagmi";
import { activeChain } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { ConnectDialog } from "@/components/app/ConnectDialog";

export function WalletButton() {
  const { address, isConnected, chainId } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    if (chainId !== activeChain.id) {
      return (
        <button
          type="button"
          className="btn btn-sm bg-danger text-cream hover:bg-danger/90"
          disabled={switching}
          onClick={() => switchChain({ chainId: activeChain.id }).catch(() => undefined)}
        >
          {switching ? "Switching…" : `Switch to ${activeChain.name}`}
        </button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className="chip chip-lime num h-9 px-3 text-[13px]">{shortAddress(address)}</span>
        <button type="button" className="btn btn-secondary btn-sm h-9" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      <ConnectDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
