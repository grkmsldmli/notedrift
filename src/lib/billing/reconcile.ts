import "server-only";

// Trusted post-Checkout reconciliation. Writes the CURRENT Stripe subscription
// truth into billing_subscriptions so a paid user isn't stuck on Free while a
// webhook is delayed or never delivered. Server/service-role only; the caller
// (the confirm-checkout route) is the gatekeeper that has already verified
// ownership + approved price + active status.
//
// Ordering safety (see ./ordering): the caller passes `orderingTs` derived from
// STRIPE's clock (the retrieve response `Date` header) — the same clock webhook
// `event.created` uses — so app-server clock skew can never reject a legitimate
// later Stripe event as stale. A later cancellation (larger event.created) still
// wins; a stale older event can never resurrect old state; a same-second
// cancellation webhook wins over reconciliation.
//
// Every DB read/write is checked: reconciliation returns "error" (never claims
// success) if persistence fails, so the confirm route can respond safely.

import type Stripe from "stripe";
import { getAdminSupabase } from "./admin";
import { normalizeSubscription } from "./webhook";
import { reconcileOutcome, shouldReconcileWrite, type ReconcileResult } from "./ordering";

export type { ReconcileResult };

export async function reconcileSubscription(
  sub: Stripe.Subscription,
  userId: string,
  orderingTs: number,
): Promise<ReconcileResult> {
  const admin = getAdminSupabase();
  const n = await normalizeSubscription(sub);

  const { data: existing, error: readErr } = await admin
    .from("billing_subscriptions")
    .select("last_event_created")
    .eq("stripe_subscription_id", n.subscriptionId)
    .maybeSingle();
  if (readErr) {
    // Can't safely order without knowing the existing state — fail safe.
    return reconcileOutcome({ readError: true, writeNeeded: false, writeError: false });
  }

  const writeNeeded = shouldReconcileWrite(
    existing?.last_event_created as number | null | undefined,
    orderingTs,
  );
  if (!writeNeeded) {
    return reconcileOutcome({ readError: false, writeNeeded: false, writeError: false });
  }

  const { error: writeErr } = await admin.from("billing_subscriptions").upsert(
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
      last_event_created: orderingTs,
      updated_at: new Date(orderingTs * 1000).toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  return reconcileOutcome({ readError: false, writeNeeded: true, writeError: !!writeErr });
}
