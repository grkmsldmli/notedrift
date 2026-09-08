// Apple StoreKit product identity — shared by the native UI, the server verifier,
// and tests. No secrets, no server-only imports. These IDs are the ALLOWLIST: the
// server grants Pro only for a transaction whose productId is one of these.

import type { BillingInterval } from "../types";

/** The app's bundle identifier — the only bundleId a verified Apple transaction
 *  may carry. Matches appId in capacitor.config.ts and the iOS target. */
export const APPLE_BUNDLE_ID = "com.notedrift.app";

/** The subscription group these products belong to (App Store Connect). */
export const APPLE_SUBSCRIPTION_GROUP = "NoteDrift Pro";

/** Canonical auto-renewable subscription product IDs. */
export const APPLE_PRODUCT_IDS = {
  monthly: "com.notedrift.app.pro.monthly",
  yearly: "com.notedrift.app.pro.yearly",
} as const;

/** The allowlist as a flat array (order: monthly, yearly). */
export const APPLE_PRODUCT_ID_LIST: readonly string[] = [
  APPLE_PRODUCT_IDS.monthly,
  APPLE_PRODUCT_IDS.yearly,
];

/** True iff `productId` is one of NoteDrift's approved subscription products. */
export function isApprovedAppleProduct(productId: string | null | undefined): boolean {
  return productId != null && APPLE_PRODUCT_ID_LIST.includes(productId);
}

/** The billing interval for an approved product id, or null if unknown. Never
 *  guesses — an unapproved product returns null and grants nothing. */
export function intervalForAppleProduct(
  productId: string | null | undefined,
): BillingInterval | null {
  if (productId === APPLE_PRODUCT_IDS.monthly) return "monthly";
  if (productId === APPLE_PRODUCT_IDS.yearly) return "yearly";
  return null;
}

/** The product id for an interval. */
export function appleProductIdFor(interval: BillingInterval): string {
  return APPLE_PRODUCT_IDS[interval];
}
