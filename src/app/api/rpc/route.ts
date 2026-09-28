import { NextResponse } from "next/server";
import { activeChain } from "@/lib/chain";

/**
 * Same-origin JSON-RPC relay. The public Robinhood Chain RPC answers 429s
 * with a doubled `access-control-allow-origin` header that browsers refuse,
 * so the browser talks to this route and this route talks to the chain.
 * Read-only and transaction-broadcast methods only; wallets sign locally.
 */
const ALLOWED = /^(eth_|net_version$|web3_clientVersion$)/;

const upstreams = [
  process.env.RPC_URL?.trim(),
  ...activeChain.rpcUrls.default.http,
  ...(process.env.RPC_FALLBACKS ?? "").split(",").map((s) => s.trim()),
].filter((u): u is string => Boolean(u));

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const calls = Array.isArray(body) ? body : [body];
  for (const c of calls) {
    const method = (c as { method?: unknown })?.method;
    if (typeof method !== "string" || !ALLOWED.test(method)) {
      return NextResponse.json({ error: `method not allowed: ${String(method)}` }, { status: 403 });
    }
  }

  let lastStatus = 502;
  for (const url of upstreams) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        lastStatus = res.status;
        continue;
      }
      const text = await res.text();
      return new NextResponse(text, { status: res.status, headers: { "content-type": "application/json" } });
    } catch {
      lastStatus = 502;
    }
  }
  return NextResponse.json({ error: "upstream unavailable" }, { status: lastStatus });
}
