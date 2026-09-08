// Pure billing-platform gates, unit-tested. Encodes the invariant that the native
// iOS app NEVER reaches Stripe checkout and the web NEVER reaches Apple IAP.

import type { BillingPlatform } from "../platform";

/** Stripe checkout/portal may run ONLY on the web (Stripe) platform. */
export function stripeCheckoutAllowed(platform: BillingPlatform): boolean {
  return platform === "stripe";
}

/** Apple StoreKit purchase/restore runs ONLY on native iOS (Apple) platform. */
export function appleIapAllowed(platform: BillingPlatform): boolean {
  return platform === "apple";
}
