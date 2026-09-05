// POST /api/billing/portal — open the Stripe-hosted Customer Portal.
//
// Authenticated user only. The Stripe Customer is derived from the user's own
// server-side mapping — the customer id is NEVER accepted from the browser, so
// user A can never open user B's portal (§27, §51). Return URL is the trusted origin.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { getStripe } from "@/lib/billing/stripe";
import { getAdminSupabase } from "@/lib/billing/admin";
import { billingModeReason, missingBillingConfig } from "@/lib/billing/config";
import { trustedOrigin } from "@/lib/billing/urls";

export async function POST(request: Request): Promise<Response> {
  if (missingBillingConfig().length > 0) {
    return NextResponse.json({ error: "billing_unconfigured" }, { status: 503 });
  }
  if (billingModeReason()) {
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getAdminSupabase();
  const { data: mapping } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const customerId = mapping?.stripe_customer_id as string | undefined;
  if (!customerId) return NextResponse.json({ error: "no_customer" }, { status: 404 });

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${trustedOrigin(request)}/`,
    });
    return NextResponse.json({ url: portal.url });
  } catch {
    return NextResponse.json({ error: "portal_error" }, { status: 502 });
  }
}
