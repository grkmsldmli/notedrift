// Pure ad-eligibility rule — no DOM, no React, no network, so it is fully
// unit-tested. Both providers (auth-bridge on the editor, standalone on tools)
// build the input from whatever plan/billing signals they have and call this.
//
// It FAILS SAFE: any uncertainty resolves to "no ad". In particular a paying Pro
// customer is NEVER shown an ad while their billing status is still loading —
// while a signed-in user's billing is unresolved, ads wait.

import { can, type Plan } from "../plans.ts";

export interface AdEligibilityInput {
  /** Kill switch on AND a valid publisher id configured. */
  readonly configured: boolean;
  /** Host is a production NoteDrift domain (never localhost/preview/staging). */
  readonly productionHost: boolean;
  /** Auth resolution phase. "loading" => we don't yet know who the user is. */
  readonly authStatus: "loading" | "ready";
  /** Whether a user is signed in (only meaningful once authStatus === "ready"). */
  readonly signedIn: boolean;
  /** For a signed-in user: has authoritative billing status resolved yet? */
  readonly billingResolved: boolean;
  /** The resolved plan: "anonymous" | "free" | "pro". */
  readonly plan: Plan;
}

/**
 * Whether NoteDrift may show its own AdSense ads right now.
 *
 * Truth table (all must hold to show ads):
 *   - configured + production host           (else: never)
 *   - auth resolved                          (loading => wait)
 *   - anonymous                              => ADS
 *   - signed-in + billing unresolved         => wait (no ads yet)
 *   - signed-in + billing resolved + !adFree => ADS   (Free)
 *   - signed-in + adFree                     => NO ADS (Pro)
 *
 * Eligibility is tied to the single source of truth via can(plan, "adFree").
 */
export function adsEligible(i: AdEligibilityInput): boolean {
  if (!i.configured) return false;
  if (!i.productionHost) return false;
  if (i.authStatus !== "ready") return false; // auth still loading → wait
  if (!i.signedIn) return true; // known anonymous → ads
  if (!i.billingResolved) return false; // signed-in, billing pending → wait
  return !can(i.plan, "adFree"); // Free → ads; Pro → none
}
