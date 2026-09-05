import "server-only";

// Server-only helpers for the Stripe webhook: normalize a Stripe Subscription into
// the fields our DB stores, and apply an event through the atomic, service-role
// apply RPC (idempotency + out-of-order protection live in SQL). The approved-price
// allowlist decides plan_key here — an unapproved price is NEVER Pro (§31).

import type Stripe from "stripe";
import { getAdminSupabase } from "./admin";
import { approvedInterval } from "./prices";
import type { BillingInterval } from "./types";

export interface NormalizedSubscription {
  subscriptionId: string;
  userId: string | null;
  customerId: string | null;
  priceId: string | null;
  planKey: "pro" | "none";
  billingInterval: BillingInterval | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  livemode: boolean;
}

/** The subscription's current period end, in ISO. Read defensively: Stripe has
 *  been moving this from the subscription to the subscription item across API
 *  versions, so try the item first, then the subscription. */
function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const secs =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof secs === "number" ? new Date(secs * 1000).toISOString() : null;
}

export async function normalizeSubscription(sub: Stripe.Subscription): Promise<NormalizedSubscription> {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const interval = await approvedInterval(priceId);
  const meta = (sub.metadata ?? {}) as Record<string, string | undefined>;
  return {
    subscriptionId: sub.id,
    userId: meta.supabase_user_id ?? null,
    customerId: typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
    priceId,
    // Approved price -> Pro; anything else -> not Pro, even if the sub is active.
    planKey: interval ? "pro" : "none",
    billingInterval: interval,
    status: sub.status,
    currentPeriodEnd: periodEndIso(sub),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    livemode: !!sub.livemode,
  };
}

export type ApplyResult =
  | "applied"
  | "duplicate"
  | "stale"
  | "unmapped"
  | "no_subscription"
  | "error";

/** Apply a normalized subscription event through the atomic service-role RPC. */
export async function applySubscriptionEvent(
  event: Stripe.Event,
  n: NormalizedSubscription,
  fallbackUserId?: string | null,
): Promise<ApplyResult> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc("apply_stripe_subscription_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_subscription_id: n.subscriptionId,
    p_user_id: n.userId ?? fallbackUserId ?? null,
    p_customer_id: n.customerId,
    p_price_id: n.priceId,
    p_plan_key: n.planKey,
    p_billing_interval: n.billingInterval,
    p_status: n.status,
    p_current_period_end: n.currentPeriodEnd,
    p_cancel_at_period_end: n.cancelAtPeriodEnd,
    p_livemode: n.livemode,
  });
  if (error) return "error";
  return (typeof data === "string" ? (data as ApplyResult) : "error");
}
