import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MILESTONES, formatDuration, formatMultiplier, illustrativeShare, multiplierFor } from "../src/lib/rewards-math.ts";

const H = 3600;

test("multiplier tiers step at 1h, 2h and 24h and never before", () => {
  assert.equal(multiplierFor(0).multiplier, 1);
  assert.equal(multiplierFor(H - 1).multiplier, 1);
  assert.equal(multiplierFor(H).multiplier, 1.5);
  assert.equal(multiplierFor(2 * H - 1).multiplier, 1.5);
  assert.equal(multiplierFor(2 * H).multiplier, 2);
  assert.equal(multiplierFor(24 * H - 1).multiplier, 2);
  assert.equal(multiplierFor(24 * H).multiplier, 3);
  assert.equal(multiplierFor(400 * H).multiplier, 3);
});

test("next milestone, countdown and progress are consistent", () => {
  const s = multiplierFor(90 * 60);
  assert.equal(s.tier, 1);
  assert.deepEqual(s.next, DEFAULT_MILESTONES[1]);
  assert.equal(s.secondsToNext, 30 * 60);
  assert.ok(Math.abs(s.progress - 0.5) < 1e-9);
  const top = multiplierFor(48 * H);
  assert.equal(top.next, null);
  assert.equal(top.secondsToNext, 0);
  assert.equal(top.progress, 1);
  assert.equal(multiplierFor(-5).multiplier, 1, "negative ages clamp to zero");
});

test("illustrative share is weight over total weight, applied to the fees", () => {
  const r = illustrativeShare({ balance: 10_000, heldSeconds: 3 * H, feesDistributed: 2, othersWeight: 30_000 });
  assert.equal(r.multiplier, 2);
  assert.equal(r.weight, 20_000);
  assert.equal(r.totalWeight, 50_000);
  assert.equal(r.share, 0.4);
  assert.equal(r.reward, 0.8);
  const none = illustrativeShare({ balance: 0, heldSeconds: 0, feesDistributed: 5, othersWeight: 0 });
  assert.equal(none.share, 0);
  assert.equal(none.reward, 0);
});

test("share never exceeds one and reward never exceeds the fees", () => {
  for (const balance of [1, 1_000, 1e9]) {
    for (const held of [0, H, 25 * H]) {
      for (const others of [0, 1, 1e12]) {
        const r = illustrativeShare({ balance, heldSeconds: held, feesDistributed: 3, othersWeight: others });
        assert.ok(r.share >= 0 && r.share <= 1);
        assert.ok(r.reward <= 3 + 1e-12);
      }
    }
  }
});

test("formatting helpers", () => {
  assert.equal(formatMultiplier(1), "1×");
  assert.equal(formatMultiplier(1.5), "1.5×");
  assert.equal(formatDuration(59), "59s");
  assert.equal(formatDuration(125), "2m 05s");
  assert.equal(formatDuration(3 * H + 12 * 60 + 9), "3h 12m");
  assert.equal(formatDuration(2 * 86400 + 3 * H), "2d 3h");
});
