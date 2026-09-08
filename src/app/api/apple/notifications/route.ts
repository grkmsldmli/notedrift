// POST /api/apple/notifications — App Store Server Notifications V2 webhook.
// Apple signs the payload; there is NO Supabase user auth here. The payload is
// cryptographically verified with Apple's official library before any entitlement
// change. Idempotent + replay-safe (notificationUUID). Configure this URL in App
// Store Connect (Production + Sandbox).
export const runtime = "nodejs";

import { getAdminSupabase } from "@/lib/billing/admin";
import { isAppleIapConfigured } from "@/lib/billing/apple/config";
import {
  verifyNotificationPayload,
  verifyNotificationTransaction,
} from "@/lib/billing/apple/verify";
import { applyAppleEntitlement } from "@/lib/billing/apple/reconcile";
import { notificationHttpStatus } from "@/lib/billing/apple/binding";

export async function POST(request: Request): Promise<Response> {
  if (!isAppleIapConfigured()) return Response.json({ ok: false }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const signedPayload =
    body && typeof (body as { signedPayload?: unknown }).signedPayload === "string"
      ? (body as { signedPayload: string }).signedPayload
      : null;
  if (!signedPayload) return Response.json({ ok: false }, { status: 400 });

  let payload;
  try {
    payload = await verifyNotificationPayload(signedPayload);
  } catch {
    // Unverifiable payload → 400 (never process unverified JSON).
    return Response.json({ ok: false }, { status: 400 });
  }

  const data = payload.data;
  // TEST notifications and events without transaction data (e.g. some summaries):
  // acknowledge so Apple stops retrying, but change no entitlement.
  if (!data || typeof data.signedTransactionInfo !== "string") {
    return Response.json({ ok: true, ignored: payload.notificationType ?? "no_data" });
  }

  let verified;
  try {
    verified = await verifyNotificationTransaction(
      typeof data.environment === "string" ? data.environment : undefined,
      data.signedTransactionInfo,
      typeof data.signedRenewalInfo === "string" ? data.signedRenewalInfo : undefined,
    );
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const applied = await applyAppleEntitlement(admin, {
    userId: null, // resolved by the RPC from the verified appAccountToken / existing row
    entitlement: verified.entitlement,
    notification: {
      uuid: payload.notificationUUID ?? null,
      type: typeof payload.notificationType === "string" ? payload.notificationType : null,
      subtype: typeof payload.subtype === "string" ? payload.subtype : null,
    },
  });

  // "unmapped" (no authenticated purchase has bound this subscription yet) returns
  // a RETRYABLE 503 so Apple retries after /api/billing/apple/verify creates the
  // mapping; "error" is 500; applied | duplicate | stale are terminal 200s.
  const status = notificationHttpStatus(applied);
  return Response.json({ ok: status < 400, applied }, { status });
}
