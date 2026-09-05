import "server-only";

// Trusted post-Checkout reconciliation. Writes the CURRENT Stripe subscription
// truth into billing_subscriptions so a paid user isn't stuck on Free while a
// webhook is delayed or never delivered. Server/service-role only; the caller
// (the confirm-checkout route) is the gatekeeper that has already verified
// ownership + approved price + active status.
//
// Ordering safety: we stamp last_event_created with the CURRENT unix time (same
// clock as Stripe event.created). Real webhooks that happen LATER (e.g. a future
// cancellation) have a larger event.created and still win; stale older webhooks
// have a smaller event.created and are skipped by the webhook apply RPC — so a
// stale event can never resurrect a cancelled subscription. We also refuse to
// regress a strictly-newer webhook state that somehow already landed.

import type Stripe from "stripe";
import { getAdminSupabase } from "./admin";
import { normalizeSubscription } from "./webhook";

export type ReconcileResult = "reconciled" | "skipped_newer";

export async function reconcileSubscription(
  sub: Stripe.Subscription,
  userId: string,
  nowUnix: number,
): Promise<ReconcileResult> {
  const admin = getAdminSupabase();
  const n = await normalizeSubscription(sub);

  const { data: existing } = await admin
    .from("billing_subscriptions")
    .select("last_event_created")
    .eq("stripe_subscription_id", n.subscriptionId)
    .maybeSingle();
  if (existing && existing.last_event_created != null && Number(existing.last_event_created) > nowUnix) {
    return "skipped_newer"; // a strictly-newer event already applied — don't regress
  }

  await admin.from("billing_subscriptions").upsert(
    {
      stripe_subscription_id: n.subscriptionId,
      user_id: userId, // trusted (verified by the caller); never from the browser
      stripe_customer_id: n.customerId,
      stripe_price_id: n.priceId,
      plan_key: n.planKey,
      billing_interval: n.billingInterval,
      status: n.status,
      current_period_end: n.currentPeriodEnd,
      cancel_at_period_end: n.cancelAtPeriodEnd,
      livemode: n.livemode,
      last_event_created: nowUnix,
      updated_at: new Date(nowUnix * 1000).toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
  return "reconciled";
}
