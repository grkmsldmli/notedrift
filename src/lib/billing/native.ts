// Registerable native-billing seam. Shared code (UpgradeDialog, AccountButton)
// talks to StoreKit ONLY through this interface, so it imports no Capacitor and the
// web bundle is unaffected. The native shell registers a StoreKit-backed
// implementation at boot (mobile/src/native/storekit.ts). Web leaves it null.

import type { BillingInterval } from "./types";

/** A StoreKit product with Apple's LOCALIZED display strings (never hardcoded). */
export interface NativeProduct {
  id: string;
  displayName: string;
  displayPrice: string; // Apple-localized, e.g. "$4.99"
  interval: BillingInterval | null;
}

/** A verified StoreKit transaction, as JWS representations for server verification. */
export interface NativeTransaction {
  signedTransaction: string;
  signedRenewalInfo?: string;
}

export type NativePurchaseOutcome = "success" | "cancelled" | "pending" | "failed";

export interface NativePurchaseResult extends Partial<NativeTransaction> {
  outcome: NativePurchaseOutcome;
  message?: string;
}

export interface NativeBilling {
  /** Fetch StoreKit products by id, with localized display strings. */
  getProducts(productIds: string[]): Promise<NativeProduct[]>;
  /** Start a purchase. `appAccountToken` is the signed-in Supabase user UUID. */
  purchase(productId: string, appAccountToken: string): Promise<NativePurchaseResult>;
  /** Current verified StoreKit entitlements (for Restore). */
  currentEntitlements(): Promise<NativeTransaction[]>;
  /** Open Apple's native manage-subscriptions sheet. */
  manageSubscriptions(): Promise<void>;
}

let impl: NativeBilling | null = null;

/** Register (or clear) the native billing implementation. Called once by the
 *  native shell; never on web. */
export function setNativeBilling(billing: NativeBilling | null): void {
  impl = billing;
}

export function getNativeBilling(): NativeBilling | null {
  return impl;
}
