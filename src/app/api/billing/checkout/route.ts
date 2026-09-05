// POST /api/billing/checkout — create a Stripe-hosted Checkout Session for Pro.
//
// Authority rules enforced here:
//   * Authenticated Supabase user required (derived from the session cookie).
//   * Request body carries ONLY { interval }. user id / customer id / price id /
//     plan are NEVER accepted from the browser (§21).
//   * The server maps interval -> approved Price id it controls (§19).
//   * One Stripe Customer per user, created/reused server-side (§23).
//   * Refuses to create a duplicate when the user is already Pro — checked against
//     server-authoritative DB state AND live Stripe subscriptions (§24).
//   * Checkout success/cancel URLs derive from the trusted server origin (§22).

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { createServerSupabase } from "@/lib/auth/server";
import { getStripe } from "@/lib/billing/stripe";
import { getAdminSupabase } from "@/lib/billing/admin";
import { missingBillingConfig } from "@/lib/billing/config";
import { approvedInterval, resolvedPriceId } from "@/lib/billing/prices";
import { trustedOrigin } from "@/lib/billing/urls";
import type { BillingInterval } from "@/lib/billing/types";

export async function POST(request: Request): Promise<Response> {
  if (missingBillingConfig().length > 0) {
    return NextResponse.json({ error: "billing_unconfigured" }, { status: 503 });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Body: interval only. Anything else is ignored.
  let interval: BillingInterval;
  try {
    const body = (await request.json()) as { interval?: unknown };
    if (body?.interval !== "monthly" && body?.interval !== "yearly") {
      return NextResponse.json({ error: "invalid_interval" }, { status: 400 });
    }
    interval = body.interval;
  } catch {
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });
  }

  // Already Pro per server-authoritative DB state -> don't start a duplicate.
  const { data: statusRows } = await supabase.rpc("get_billing_status");
  const status = Array.isArray(statusRows) ? statusRows[0] : statusRows;
  if (status?.plan === "pro") {
    return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
  }

  const stripe = getStripe();
  const admin = getAdminSupabase();

  let customerId: string;
  try {
    customerId = await ensureCustomer(admin, stripe, user.id, user.email ?? undefined);
  } catch {
    return NextResponse.json({ error: "customer_error" }, { status: 502 });
  }

  // Guard against a duplicate even if the DB is briefly stale (webhook lag):
  // if Stripe already has a live subscription on an approved price, send them to
  // the portal instead (§24).
  if (await hasLiveApprovedSubscription(stripe, customerId)) {
    return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
  }

  const origin = trustedOrigin(request);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: await resolvedPriceId(interval), quantity: 1 }],
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancelled`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      // Stamp the subscription so webhook events resolve the user without a lookup.
      subscription_data: { metadata: { supabase_user_id: user.id } },
      allow_promotion_codes: false,
    });
    if (!session.url) return NextResponse.json({ error: "checkout_error" }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "checkout_error" }, { status: 502 });
  }
}

/** Return this user's Stripe Customer id, creating and persisting the 1:1 mapping
 *  on first use. The customer id is always server-generated — never client input. */
async function ensureCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  email: string | undefined,
): Promise<string> {
  const { data: existing } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id as string;

  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  const { error } = await admin
    .from("billing_customers")
    .insert({ user_id: userId, stripe_customer_id: customer.id });
  if (error) {
    // Lost a race: another request mapped this user first. Reuse that mapping and
    // discard the extra Stripe customer we just created (best effort).
    const { data: raced } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (raced?.stripe_customer_id) {
      try {
        await stripe.customers.del(customer.id);
      } catch {
        /* orphan cleanup is best-effort */
      }
      return raced.stripe_customer_id as string;
    }
    throw error;
  }
  return customer.id;
}

/** Whether the customer already has an active/trialing subscription on one of the
 *  approved Pro prices (defends against duplicates when the DB is briefly stale). */
async function hasLiveApprovedSubscription(stripe: Stripe, customerId: string): Promise<boolean> {
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const s of subs.data) {
      if (s.status !== "active" && s.status !== "trialing") continue;
      if (await approvedInterval(s.items?.data?.[0]?.price?.id ?? null)) return true;
    }
    return false;
  } catch {
    return false; // never block checkout on a listing error
  }
}
