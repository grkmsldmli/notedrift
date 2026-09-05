// POST /api/stripe/webhook — Stripe webhook receiver (server-only, no user session).
//
// Security & correctness:
//   * Verifies the Stripe signature over the RAW body (§28); an invalid signature
//     is rejected with 400 and never touches the DB.
//   * Subscription lifecycle events are authoritative. checkout.session.completed
//     is handled by loading the real subscription — checkout completion alone is
//     never trusted to grant Pro (§26, §30).
//   * The approved-price allowlist decides plan_key; an unapproved price is never
//     Pro (§31).
//   * Idempotency (event id) and out-of-order protection (event.created) live in
//     the atomic apply RPC (§33, §34). A duplicate/stale event is a harmless 200.
//   * If the user can't be resolved yet ("unmapped") or a DB error occurs, we
//     return 5xx so Stripe retries later (§35).

export const runtime = "nodejs";

import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { hasWebhookSecret, webhookSecret } from "@/lib/billing/config";
import { applySubscriptionEvent, normalizeSubscription } from "@/lib/billing/webhook";

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });
  if (!hasWebhookSecret()) {
    // Endpoint exists but isn't configured to verify signatures yet.
    return new Response("webhook not configured", { status: 503 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret());
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  try {
    const retry = await handleEvent(event);
    return retry
      ? new Response("retry", { status: 500 })
      : new Response("ok", { status: 200 });
  } catch {
    // Unexpected error -> let Stripe retry.
    return new Response("error", { status: 500 });
  }
}

/** Process one event. Returns true if Stripe should retry (transient failure). */
async function handleEvent(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const result = await applySubscriptionEvent(event, await normalizeSubscription(sub));
      return result === "unmapped" || result === "error";
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subRef = session.subscription;
      const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
      // A non-subscription checkout (shouldn't happen for us) — nothing to apply.
      if (!subscriptionId) return false;
      // Load the authoritative subscription rather than trusting the session.
      const sub = await getStripe().subscriptions.retrieve(subscriptionId);
      const fallbackUserId =
        (session.metadata?.supabase_user_id as string | undefined) ??
        (session.client_reference_id ?? undefined);
      const result = await applySubscriptionEvent(event, await normalizeSubscription(sub), fallbackUserId);
      return result === "unmapped" || result === "error";
    }

    default:
      // Unhandled event types are acknowledged so Stripe stops retrying them.
      return false;
  }
}
