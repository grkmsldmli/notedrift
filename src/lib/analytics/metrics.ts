import "server-only";

// Server-only revenue metrics computed from NoteDrift's OWN data (Stripe-backed
// billing tables + the email list + the tool registry). Read via the service-role
// admin client. This covers the numbers we own — MRR/ARR, active Pro, interval
// mix, marketing-list size, indexed tool pages. The traffic/RPM/keyword metrics
// (Google impressions, organic clicks, top-10 keywords, page RPM) live in Google
// Search Console + AdSense and are surfaced from those dashboards, not here.

import { getAdminSupabase } from "@/lib/billing/admin";
import { computeMrr, computeArr, type SubInterval } from "./mrr";
import { allToolRoutes } from "@/lib/seo/tool-routes";

export interface RevenueMetrics {
  generatedAt: string;
  mrrUsd: number;
  arrUsd: number;
  activeProSubscriptions: number;
  byInterval: { monthly: number; yearly: number };
  marketingOptInCount: number;
  indexedToolPages: number;
}

export async function computeRevenueMetrics(): Promise<RevenueMetrics> {
  const admin = getAdminSupabase();

  // Only count subscriptions in the configured (live vs test) mode, so test rows
  // never inflate production MRR.
  const { data: cfg } = await admin
    .from("billing_config")
    .select("expected_livemode")
    .eq("id", 1)
    .maybeSingle();
  const expected = cfg?.expected_livemode ?? false;

  const { data: subs } = await admin
    .from("billing_subscriptions")
    .select("billing_interval")
    .eq("plan_key", "pro")
    .in("status", ["active", "trialing"])
    .eq("livemode", expected);
  const active = (subs ?? []) as Array<{ billing_interval: SubInterval }>;

  const byInterval = { monthly: 0, yearly: 0 };
  for (const s of active) {
    if (s.billing_interval === "monthly") byInterval.monthly++;
    else if (s.billing_interval === "yearly") byInterval.yearly++;
  }

  const counted = active.map((s) => ({ interval: s.billing_interval }));

  const { count: optInCount } = await admin
    .from("email_preferences")
    .select("user_id", { count: "exact", head: true })
    .eq("marketing_opt_in", true);

  return {
    generatedAt: new Date().toISOString(),
    mrrUsd: computeMrr(counted),
    arrUsd: computeArr(counted),
    activeProSubscriptions: active.length,
    byInterval,
    marketingOptInCount: optInCount ?? 0,
    indexedToolPages: allToolRoutes().length,
  };
}
