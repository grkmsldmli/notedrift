// POST /api/billing/confirm-checkout — trusted post-Checkout confirmation.
//
// Closes the gap where a paid user sits on Free because the webhook is delayed or
// undelivered. It verifies EVERYTHING against Stripe with the server key and only
// then reconciles the subscription into trusted billing state. The browser sends
// only { sessionId } — never user/customer/price/plan — and session_id alone never
// grants Pro (it's just a lookup handle). Authority stays: Stripe → server verify
// → Supabase billing → entitlement (§4–8).

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { getStripe } from "@/lib/billing/stripe";
import { getAdminSupabase } from "@/lib/billing/admin";
import { billingModeReason, expectedStripeLivemode, missingBillingConfig } from "@/lib/billing/config";
import { approvedInterval } from "@/lib/billing/prices";
import { parseHttpDateSeconds } from "@/lib/billing/ordering";
import { reconcileSubscription } from "@/lib/billing/reconcile";

/** Typed outcomes the client's activation flow understands. */
type Status =
  | "pro" // verified + reconciled → Pro
  | "incomplete" // checkout not completed / not paid yet
  | "not_active" // subscription not active/trialing
  | "unknown_price" // active but not an approved Pro price
  | "invalid" // bad request / not sandbox / wrong mode
  | "forbidden" // belongs to another user
  | "not_found" // no such session/subscription
  | "error" // server/persistence failure — retry (never a false Pro claim)
  | "unauthorized"
  | "unconfigured";

const json = (status: Status, http = 200) => NextResponse.json({ status }, { status: http });

export async function POST(request: Request): Promise<Response> {
  if (missingBillingConfig().length > 0) return json("unconfigured", 503);
  if (billingModeReason()) return json("unconfigured", 503); // fail closed on mode mismatch

  const supabase = await createServerSupabase();
  if (!supabase) return json("unauthorized", 401);
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json("unauthorized", 401);

  let sessionId: string;
  try {
    const body = (await request.json()) as { sessionId?: unknown };
    if (typeof body?.sessionId !== "string" || !body.sessionId.startsWith("cs_")) return json("invalid", 400);
    sessionId = body.sessionId;
  } catch {
    return json("invalid", 400);
  }

  const stripe = getStripe();

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return json("not_found", 404);
  }

  // Must be a subscription checkout in the EXPECTED Stripe mode that belongs to
  // THIS user. livemode must EQUAL the configured expectation (not merely be
  // false) — a wrong-mode session can never grant Pro (§6).
  if (session.livemode !== expectedStripeLivemode()) return json("invalid", 400);
  if (session.mode !== "subscription") return json("invalid", 400);
  const owner =
    (session.metadata?.supabase_user_id as string | undefined) ?? session.client_reference_id ?? null;
  if (owner !== user.id) return json("forbidden", 403); // cross-user session can't grant Pro

  if (session.status !== "complete" || session.payment_status === "unpaid") {
    return json("incomplete"); // 200 — not paid yet; caller may retry
  }

  const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const admin = getAdminSupabase();
  const { data: mapping } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  // If we already have a mapping, it must match the session's customer.
  if (mapping?.stripe_customer_id && customerId && mapping.stripe_customer_id !== customerId) {
    return json("forbidden", 403);
  }
  // Ensure the mapping exists (checkout normally created it; be resilient). This is
  // a best-effort convenience for the portal — it does NOT gate Pro entitlement,
  // so a failure here doesn't deny a paid user; we inspect it but continue.
  if (!mapping?.stripe_customer_id && customerId) {
    await admin
      .from("billing_customers")
      .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
  }

  const subRef = session.subscription;
  const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subscriptionId) return json("incomplete");

  let sub;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return json("not_found", 404);
  }

  // The subscription is a distinct Stripe object; re-check its mode too.
  if (sub.livemode !== expectedStripeLivemode()) return json("invalid", 400);

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const interval = await approvedInterval(priceId);
  const active = sub.status === "active" || sub.status === "trialing";
  if (!active) return json("not_active");
  if (!interval) return json("unknown_price"); // active but not an approved Pro price → no Pro

  // Ordering timestamp on STRIPE's clock (the retrieve response Date header) — NOT
  // the local server clock — so a later real cancellation webhook can never be
  // rejected as stale by app-server clock skew. Fail safe (retry) if unavailable.
  const orderingTs = parseHttpDateSeconds(sub.lastResponse?.headers?.["date"]);
  if (orderingTs == null) return json("error", 500);

  const result = await reconcileSubscription(sub, user.id, orderingTs);
  if (result === "error") return json("error", 500); // persistence failed — never claim Pro
  return json("pro");
}
