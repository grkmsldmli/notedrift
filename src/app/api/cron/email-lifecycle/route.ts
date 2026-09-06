// Scheduled lifecycle email job (Vercel Cron). Protected by CRON_SECRET — returns
// 401 without it, so it can't be triggered by the public. Currently sends the
// weekly free-tools newsletter to opted-in users, idempotent per ISO week so a
// re-run (or an overlapping schedule) never double-sends.
//
// Time-delayed sends that key off auth.users timestamps (discovery ~day 2, dormant
// ~14 days, winback ~30–45 days for former Pro) are the next iteration — they need
// a user-activity index and are intentionally not guessed here. Event-driven
// lifecycle emails (welcome, pro-welcome, export-intent, cloud-limit) are already
// live via /api/email/lifecycle and don't depend on this cron.
//
// Enable: add a Vercel Cron entry (see vercel.json) + set CRON_SECRET, RESEND_API_KEY.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/billing/admin";
import { emailConfigured } from "@/lib/email/send";
import { sendKindOnce } from "@/lib/email/dispatch";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/** ISO-week key like "2026-W36" for weekly idempotency. */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ ok: true, skipped: "email_unconfigured" });

  const periodKey = isoWeekKey(new Date());
  const admin = getAdminSupabase();

  let sent = 0;
  let skipped = 0;
  let scanned = 0;
  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("email_preferences")
      .select("user_id, email")
      .eq("marketing_opt_in", true)
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    scanned += data.length;
    for (const row of data) {
      const res = await sendKindOnce({
        kind: "newsletter",
        userId: row.user_id as string,
        email: row.email as string,
        periodKey,
      });
      if ("ok" in res && res.ok) sent++;
      else skipped++;
    }
    if (data.length < pageSize) break;
  }

  return NextResponse.json({ ok: true, job: "newsletter", periodKey, scanned, sent, skipped });
}

// Some cron providers issue GET; accept it too.
export const GET = POST;
