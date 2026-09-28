import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain, LOCAL_ID } from "@/lib/chain";

/**
 * Browser reads go through the same-origin /api/rpc relay: the public
 * Robinhood Chain RPC answers rate-limits with a doubled CORS header that
 * browsers reject, and the relay also hides the RPC URL from the bundle.
 * The local Hardhat node is called directly (it allows CORS).
 */
function transportUrl(): string | undefined {
  if (typeof window === "undefined") return undefined; // server: the chain's default RPC
  if (activeChain.id === LOCAL_ID) return activeChain.rpcUrls.default.http[0];
  return "/api/rpc";
}

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: {
    [activeChain.id]: http(transportUrl(), { batch: activeChain.id !== LOCAL_ID }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
