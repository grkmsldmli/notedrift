// Pure MRR (monthly recurring revenue) math — derived from the canonical PRICING,
// so it can never drift from what customers are actually charged. Unit-tested.

import { PRICING } from "../plans.ts";

export type SubInterval = "monthly" | "yearly" | null;

export interface CountedSub {
  interval: SubInterval;
}

/** Monthly-normalized USD value of one active subscription. A yearly plan
 *  contributes 1/12 of its annual price; an unknown interval contributes 0. */
export function monthlyValueOf(interval: SubInterval): number {
  if (interval === "monthly") return PRICING.monthly;
  if (interval === "yearly") return PRICING.annual / 12;
  return 0;
}

/** MRR (USD, 2dp) = sum of monthly-normalized value across active subscriptions. */
export function computeMrr(subs: CountedSub[]): number {
  const total = subs.reduce((sum, s) => sum + monthlyValueOf(s.interval), 0);
  return Math.round(total * 100) / 100;
}

/** Annualized run-rate (ARR) from MRR. */
export function computeArr(subs: CountedSub[]): number {
  return Math.round(computeMrr(subs) * 12 * 100) / 100;
}
