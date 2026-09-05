"use client";

// Browser billing helpers. Reads a SANITIZED status via the auth.uid()-scoped
// get_billing_status() RPC (server-authoritative; the client can never set it),
// and starts Stripe-hosted Checkout / Portal via the server routes. No secrets.

import { getBrowserSupabase } from "@/lib/auth/client";
import { FREE_BILLING_STATUS, type BillingInterval, type BillingStatus } from "./types";

/** Current user's sanitized billing status. Fails CLOSED to Free on any problem —
 *  Pro is only ever reported when the server RPC says so. */
export async function fetchBillingStatus(): Promise<BillingStatus | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("get_billing_status");
  if (error) return FREE_BILLING_STATUS;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        plan?: string;
        subscription_status?: string | null;
        billing_interval?: string | null;
        current_period_end?: string | null;
        cancel_at_period_end?: boolean | null;
        can_manage_billing?: boolean | null;
      }
    | undefined;
  if (!row) return FREE_BILLING_STATUS;
  return {
    plan: row.plan === "pro" ? "pro" : "free",
    subscriptionStatus: row.subscription_status ?? null,
    billingInterval:
      row.billing_interval === "monthly" || row.billing_interval === "yearly"
        ? row.billing_interval
        : null,
    currentPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    canManageBilling: !!row.can_manage_billing,
  };
}

type ActionResult = { ok: true; url: string } | { ok: false; error: string };

export async function startCheckout(interval: BillingInterval): Promise<ActionResult> {
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && json.url) return { ok: true, url: json.url };
    return { ok: false, error: json.error ?? "checkout_failed" };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function openBillingPortal(): Promise<ActionResult> {
  try {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && json.url) return { ok: true, url: json.url };
    return { ok: false, error: json.error ?? "portal_failed" };
  } catch {
    return { ok: false, error: "network" };
  }
}
