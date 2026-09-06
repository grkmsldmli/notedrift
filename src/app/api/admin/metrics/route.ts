// Owner-only revenue metrics endpoint. Protected by ADMIN_METRICS_SECRET (Bearer)
// — returns 401 without it, and 501 when it isn't configured, so it's inert until
// the owner opts in. Returns the numbers NoteDrift owns (MRR/ARR, active Pro,
// interval mix, email-list size, indexed pages) as JSON for a weekly review.
// Google impressions/clicks/keywords/RPM come from Search Console + AdSense.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { computeRevenueMetrics } from "@/lib/analytics/metrics";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.ADMIN_METRICS_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 501 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await computeRevenueMetrics());
  } catch {
    return NextResponse.json({ error: "metrics_error" }, { status: 500 });
  }
}
