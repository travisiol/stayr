/**
 * Pure reward arithmetic, shared by the landing page's illustrative example
 * and the app's local timers. It mirrors StayrRewards.sol at the level of
 * ideas — multiplier tiers, weight = balance × multiplier, share = weight /
 * total weight — not at the level of contract accounting. Displayed
 * balances always come from the contract; this only ever labels, previews
 * and counts down.
 */
export type Milestone = { afterSeconds: number; multiplier: number };

export const DEFAULT_BASE_MULTIPLIER = 1;
export const DEFAULT_MILESTONES: readonly Milestone[] = [
  { afterSeconds: 60 * 60, multiplier: 1.5 },
  { afterSeconds: 2 * 60 * 60, multiplier: 2 },
  { afterSeconds: 24 * 60 * 60, multiplier: 3 },
];

export type MultiplierState = {
  multiplier: number;
  tier: number;
  next: Milestone | null;
  /** Seconds until `next`, 0 when at the top tier. */
  secondsToNext: number;
  /** Progress through the current tier, 0..1 (1 at the top tier). */
  progress: number;
};

export function multiplierFor(
  heldSeconds: number,
  milestones: readonly Milestone[] = DEFAULT_MILESTONES,
  base = DEFAULT_BASE_MULTIPLIER,
): MultiplierState {
  const held = Math.max(0, heldSeconds);
  let tier = 0;
  let multiplier = base;
  for (let i = 0; i < milestones.length; i++) {
    if (held >= milestones[i].afterSeconds) {
      tier = i + 1;
      multiplier = milestones[i].multiplier;
    }
  }
  const next = tier < milestones.length ? milestones[tier] : null;
  if (!next) return { multiplier, tier, next: null, secondsToNext: 0, progress: 1 };
  const from = tier === 0 ? 0 : milestones[tier - 1].afterSeconds;
  const span = next.afterSeconds - from;
  return {
    multiplier,
    tier,
    next,
    secondsToNext: next.afterSeconds - held,
    progress: span > 0 ? Math.min(1, Math.max(0, (held - from) / span)) : 1,
  };
}

export type IllustrativeInput = {
  /** Token balance of the visitor. */
  balance: number;
  /** How long they have held without selling, in seconds. */
  heldSeconds: number;
  /** Hypothetical fees distributed over the period, in ETH. */
  feesDistributed: number;
  /** Everyone else's weighted balance (Σ balance × multiplier). */
  othersWeight: number;
  milestones?: readonly Milestone[];
  base?: number;
};

export type IllustrativeResult = {
  multiplier: number;
  weight: number;
  totalWeight: number;
  share: number;
  reward: number;
};

/**
 * The landing example. Everything is an input; nothing is read from the
 * chain. `share` is the visitor's weight over the total weight *including*
 * theirs, and `reward` is that share of the hypothetical fees.
 */
export function illustrativeShare(input: IllustrativeInput): IllustrativeResult {
  const { multiplier } = multiplierFor(input.heldSeconds, input.milestones, input.base);
  const weight = Math.max(0, input.balance) * multiplier;
  const totalWeight = weight + Math.max(0, input.othersWeight);
  const share = totalWeight > 0 ? weight / totalWeight : 0;
  return { multiplier, weight, totalWeight, share, reward: share * Math.max(0, input.feesDistributed) };
}

/** Seconds → "3h 12m" / "42m 05s" / "2d 3h". */
export function formatDuration(seconds: number, opts: { compact?: boolean } = {}): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return opts.compact ? `${h}h ${m}m` : `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** "1.5×" */
export function formatMultiplier(m: number): string {
  return `${Number.isInteger(m) ? m : m.toFixed(1)}×`;
}
