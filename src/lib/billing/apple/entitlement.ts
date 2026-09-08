// Pure mapping from a VERIFIED Apple transaction (+ optional renewal info) to the
// entitlement fields NoteDrift stores. No secrets, no SDK, no DOM — so the
// grant/expiry/revoke/interval logic is unit-tested directly. Cryptographic
// verification happens in verify.ts (server) BEFORE this runs; this never trusts
// unverified input.

import type { BillingInterval } from "../types";
import { intervalForAppleProduct } from "./products.ts";

/** The verified transaction fields we consume (subset of the Apple SDK's
 *  JWSTransactionDecodedPayload). All dates are epoch milliseconds. */
export interface AppleTransactionLike {
  originalTransactionId?: string;
  transactionId?: string;
  bundleId?: string;
  productId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  appAccountToken?: string;
  signedDate?: number;
  revocationDate?: number;
  environment?: string; // 'Sandbox' | 'Production'
}

/** The verified renewal-info fields we consume (subset of JWSRenewalInfoDecodedPayload). */
export interface AppleRenewalLike {
  autoRenewStatus?: number; // 1 = on, 0 = off
  gracePeriodExpiresDate?: number; // ms
  isInBillingRetryPeriod?: boolean;
}

export type AppleEntitlementStatus = "active" | "expired" | "revoked";

/** The normalized, storable entitlement. `expiresAt` is grace-period aware. */
export interface AppleEntitlement {
  originalTransactionId: string;
  latestTransactionId: string | null;
  productId: string;
  billingInterval: BillingInterval | null;
  environment: string;
  appAccountToken: string | null;
  purchasedAt: string | null; // ISO
  expiresAt: string | null; // ISO
  revokedAt: string | null; // ISO
  autoRenew: boolean;
  signedDate: number | null;
  status: AppleEntitlementStatus;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Entitlement expiry, extended to the grace-period end while a subscription is in
 *  billing retry (Apple keeps the customer entitled during grace). */
function effectiveExpiry(tx: AppleTransactionLike, renewal?: AppleRenewalLike): number | null {
  if (tx.expiresDate == null) return null;
  const grace = renewal?.gracePeriodExpiresDate;
  if (grace != null && grace > tx.expiresDate) return grace;
  return tx.expiresDate;
}

/** Build the storable entitlement from a verified transaction. Returns null when
 *  the transaction lacks the identifiers we require (never grants on junk).
 *  `nowMs` is injectable for deterministic tests. */
export function toAppleEntitlement(
  tx: AppleTransactionLike,
  renewal?: AppleRenewalLike,
  nowMs: number = Date.now(),
): AppleEntitlement | null {
  if (!tx.originalTransactionId || !tx.productId) return null;

  const expiryMs = effectiveExpiry(tx, renewal);
  const revokedAt = tx.revocationDate != null ? iso(tx.revocationDate) : null;

  const status: AppleEntitlementStatus = revokedAt
    ? "revoked"
    : expiryMs != null && expiryMs <= nowMs
      ? "expired"
      : "active";

  return {
    originalTransactionId: tx.originalTransactionId,
    latestTransactionId: tx.transactionId ?? null,
    productId: tx.productId,
    billingInterval: intervalForAppleProduct(tx.productId),
    environment: tx.environment === "Sandbox" ? "Sandbox" : "Production",
    appAccountToken: tx.appAccountToken ?? null,
    purchasedAt: tx.purchaseDate != null ? iso(tx.purchaseDate) : null,
    expiresAt: expiryMs != null ? iso(expiryMs) : null,
    revokedAt,
    // Absent renewal info (e.g. a one-off verify) → assume auto-renew on.
    autoRenew: renewal?.autoRenewStatus == null ? true : renewal.autoRenewStatus === 1,
    signedDate: tx.signedDate ?? null,
    status,
  };
}

/** Whether an entitlement currently grants Pro (mirrors the DB is_pro() Apple
 *  branch; used for tests and any server-side sanity check). `nowMs` injectable. */
export function appleEntitlementGrantsPro(
  e: AppleEntitlement,
  nowMs: number = Date.now(),
): boolean {
  if (e.revokedAt) return false;
  if (e.expiresAt && new Date(e.expiresAt).getTime() <= nowMs) return false;
  return true;
}
