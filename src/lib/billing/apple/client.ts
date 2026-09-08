"use client";

// Client orchestration for Apple IAP on native iOS: fetch products, purchase,
// restore, manage. Purchases/restores are sent to /api/billing/apple/verify with a
// Bearer Supabase token; Pro is granted ONLY after the server verifies the Apple
// transaction and reconciles entitlement. Never trusts the client for Pro.

import { apiUrl } from "@/lib/platform";
import { getAccessToken, getCurrentUser } from "@/lib/auth/client";
import { getNativeBilling, type NativeProduct, type NativeTransaction } from "../native";
import { APPLE_PRODUCT_ID_LIST } from "./products";
import { isValidAppAccountToken } from "./binding";

export type AppleActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_signed_in" | "unavailable" | "cancelled" | "verify_failed" | "no_subscription";
    };

/** Fetch the two subscription products with Apple's localized prices. Empty when
 *  native billing isn't available. */
export async function getAppleProducts(): Promise<NativeProduct[]> {
  const nb = getNativeBilling();
  if (!nb) return [];
  try {
    return await nb.getProducts([...APPLE_PRODUCT_ID_LIST]);
  } catch {
    return [];
  }
}

/** Send a verified transaction to the server; true iff the server confirms Pro. */
async function verifyOnServer(tx: NativeTransaction): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(apiUrl("/api/billing/apple/verify"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        signedTransaction: tx.signedTransaction,
        signedRenewalInfo: tx.signedRenewalInfo,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; plan?: string };
    return res.ok && json.status === "ok" && json.plan === "pro";
  } catch {
    return false;
  }
}

/** Purchase a product (must be signed in). Resolves ok only after server-verified
 *  Pro. The caller should refreshBilling() on ok. */
export async function purchaseApplePro(productId: string): Promise<AppleActionResult> {
  const nb = getNativeBilling();
  if (!nb) return { ok: false, reason: "unavailable" };
  const user = await getCurrentUser();
  // A purchase MUST be bound to a signed-in user with a valid UUID appAccountToken.
  if (!user || !isValidAppAccountToken(user.id)) return { ok: false, reason: "not_signed_in" };

  let result;
  try {
    // appAccountToken = the signed-in Supabase user UUID (server checks equality).
    result = await nb.purchase(productId, user.id);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (result.outcome === "cancelled") return { ok: false, reason: "cancelled" };
  if (result.outcome !== "success" || !result.signedTransaction) {
    return { ok: false, reason: "verify_failed" };
  }
  const ok = await verifyOnServer({
    signedTransaction: result.signedTransaction,
    signedRenewalInfo: result.signedRenewalInfo,
  });
  return ok ? { ok: true } : { ok: false, reason: "verify_failed" };
}

/** Restore purchases: reconcile every current StoreKit entitlement server-side. */
export async function restoreApplePro(): Promise<AppleActionResult> {
  const nb = getNativeBilling();
  if (!nb) return { ok: false, reason: "unavailable" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "not_signed_in" };

  let txs: NativeTransaction[];
  try {
    txs = await nb.currentEntitlements();
    // StoreKit currentEntitlements is the normal source. Only for an EXPLICIT
    // Restore action, if it's empty, force a one-time AppStore.sync() (may prompt
    // for Apple sign-in) and re-read. Never called automatically at launch.
    if (txs.length === 0 && nb.sync) {
      await nb.sync();
      txs = await nb.currentEntitlements();
    }
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (txs.length === 0) return { ok: false, reason: "no_subscription" };

  let anyPro = false;
  for (const tx of txs) {
    if (await verifyOnServer(tx)) anyPro = true;
  }
  return anyPro ? { ok: true } : { ok: false, reason: "no_subscription" };
}

/** Open Apple's native manage-subscriptions UI. */
export async function manageAppleSubscriptions(): Promise<void> {
  const nb = getNativeBilling();
  if (!nb) return;
  try {
    await nb.manageSubscriptions();
  } catch {
    /* user dismissed or unavailable — non-fatal */
  }
}
