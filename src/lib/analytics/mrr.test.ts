// MRR math tests. Run with `npm test`. Pure — no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyValueOf, computeMrr, computeArr } from "./mrr.ts";
import { PRICING } from "../plans.ts";

test("monthlyValueOf normalizes by interval", () => {
  assert.equal(monthlyValueOf("monthly"), PRICING.monthly);
  assert.equal(monthlyValueOf("yearly"), PRICING.annual / 12);
  assert.equal(monthlyValueOf(null), 0);
});

test("computeMrr sums monthly-normalized values (2dp)", () => {
  // 2 monthly + 1 yearly = 3.99*2 + 29.99/12
  const mrr = computeMrr([{ interval: "monthly" }, { interval: "monthly" }, { interval: "yearly" }]);
  assert.equal(mrr, Math.round((3.99 * 2 + 29.99 / 12) * 100) / 100);
  assert.equal(computeMrr([]), 0);
});

test("unknown-interval subscriptions contribute nothing", () => {
  assert.equal(computeMrr([{ interval: null }, { interval: "monthly" }]), PRICING.monthly);
});

test("ARR is 12x MRR", () => {
  const subs = [{ interval: "monthly" as const }, { interval: "yearly" as const }];
  assert.equal(computeArr(subs), Math.round(computeMrr(subs) * 12 * 100) / 100);
});
