// POST /api/billing/apple/verify — reconcile a StoreKit purchase/restore into
// server-authoritative Pro. Native-safe (Bearer Supabase token). Never grants Pro
// before Apple's cryptographic verification succeeds AND the transaction's
// appAccountToken equals the authenticated user.
export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/lib/auth/requireUser";
import { getAdminSupabase } from "@/lib/billing/admin";
import { isAppleIapConfigured } from "@/lib/billing/apple/config";
import { AppleVerifyError, verifyDeviceTransaction } from "@/lib/billing/apple/verify";
import { appAccountTokenMatches } from "@/lib/billing/apple/guards";
import { applyAppleEntitlement } from "@/lib/billing/apple/reconcile";
import { handleNativePreflight, nativeCorsHeaders } from "@/lib/http/cors";

const METHODS = "POST, OPTIONS";

export function OPTIONS(request: Request): Response {
  return handleNativePreflight(request, METHODS);
}

export async function POST(request: Request): Promise<Response> {
  const cors = nativeCorsHeaders(request, METHODS);
  const reply = (status: number, body: unknown) =>
    Response.json(body, { status, headers: cors });

  if (!isAppleIapConfigured()) return reply(503, { status: "unconfigured" });

  const ctx = await requireAuthenticatedUser(request);
  if (!ctx) return reply(401, { status: "unauthorized" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { status: "invalid" });
  }
  const signedTransaction =
    body && typeof (body as { signedTransaction?: unknown }).signedTransaction === "string"
      ? (body as { signedTransaction: string }).signedTransaction
      : null;
  const signedRenewalInfo =
    body && typeof (body as { signedRenewalInfo?: unknown }).signedRenewalInfo === "string"
      ? (body as { signedRenewalInfo: string }).signedRenewalInfo
      : undefined;
  if (!signedTransaction) return reply(400, { status: "invalid" });

  let verified;
  try {
    verified = await verifyDeviceTransaction(signedTransaction, signedRenewalInfo);
  } catch (e) {
    const code = e instanceof AppleVerifyError ? e.code : "verification_failed";
    // 400 for bad/foreign payloads; the client treats any non-"ok" as "not pro".
    return reply(400, { status: code });
  }

  const ent = verified.entitlement;
  // The signed transaction's appAccountToken MUST equal the authenticated user.
  // Never trust a user id from the request body.
  if (!appAccountTokenMatches(ent.appAccountToken, ctx.user.id)) {
    return reply(403, { status: "account_mismatch" });
  }

  const admin = getAdminSupabase();
  const applied = await applyAppleEntitlement(admin, {
    userId: ctx.user.id,
    entitlement: ent,
  });
  if (applied === "error" || applied === "unmapped") return reply(500, { status: "error" });

  // Fresh sanitized status, computed by the DB (user-scoped RPC).
  const { data } = await ctx.supabase.rpc("get_billing_status");
  const row = (Array.isArray(data) ? data[0] : data) as { plan?: string } | null;
  return reply(200, {
    status: "ok",
    applied,
    plan: row?.plan === "pro" ? "pro" : "free",
    billing: row ?? null,
  });
}
