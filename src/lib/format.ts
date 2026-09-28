import { formatUnits } from "viem";

export function shortAddress(address: string, chars = 4): string {
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** 18-decimal wei → a compact decimal string with `digits` fraction digits. */
export function fmtEth(wei: bigint, digits = 5): string {
  return trimZeros(Number(formatUnits(wei, 18)).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
}

export function fmtUsdg(units: bigint, digits = 2): string {
  return Number(formatUnits(units, 6)).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Token amount (18 decimals) → "12,345.67" or "1.2M". */
export function fmtTokens(wei: bigint, opts: { compact?: boolean } = {}): string {
  const n = Number(formatUnits(wei, 18));
  if (opts.compact && n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (opts.compact && n >= 10_000) return `${(n / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });
}

export function fmtNumber(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtPercent(fraction: number, digits = 2): string {
  return `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 })}%`;
}

export function bpsToMultiplier(bps: number | bigint): number {
  return Number(bps) / 10_000;
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
