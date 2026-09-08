// DELETE /api/account — in-app account deletion (App Store Guideline 5.1.1(v)).
// Native-safe (Bearer) and web-safe (cookie). Deletes ALL of the user's data: the
// canvas-assets storage objects (the only non-cascading data) explicitly, then the
// auth user, which cascade-removes every user-scoped table (cloud canvases/assets/
// refs, billing customers/subscriptions, Apple subscriptions, email prefs/events).
//
// NOT covered here (documented for the UI): deleting the account does NOT cancel an
// active App Store or Stripe subscription — those are managed in the App Store /
// Stripe respectively. The confirmation UI states this.
export const runtime = "nodejs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUser } from "@/lib/auth/requireUser";
import { getAdminSupabase } from "@/lib/billing/admin";
import { handleNativePreflight, nativeCorsHeaders } from "@/lib/http/cors";

const METHODS = "DELETE, OPTIONS";
const ASSET_BUCKET = "canvas-assets";

export function OPTIONS(request: Request): Response {
  return handleNativePreflight(request, METHODS);
}

export async function DELETE(request: Request): Promise<Response> {
  const cors = nativeCorsHeaders(request, METHODS);
  const reply = (status: number, body: unknown) =>
    Response.json(body, { status, headers: cors });

  const ctx = await requireAuthenticatedUser(request);
  if (!ctx) return reply(401, { status: "unauthorized" });

  const userId = ctx.user.id; // trusted identity — never from the body
  const admin = getAdminSupabase();

  // (a) Delete storage objects under "<userId>/…" — they do NOT cascade on user
  // deletion. Best-effort: a storage hiccup must not block account removal.
  try {
    await deleteUserStorageObjects(admin, userId);
  } catch {
    /* continue — the account (and its DB rows) are still deleted below */
  }

  // (b) Delete the auth user LAST. FK on delete cascade removes every user-scoped
  // table row (cloud_*, billing_*, billing_apple_subscriptions, email_*).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return reply(500, { status: "error" });

  return reply(200, { status: "deleted" });
}

async function deleteUserStorageObjects(admin: SupabaseClient, userId: string): Promise<void> {
  const bucket = admin.storage.from(ASSET_BUCKET);
  const PAGE = 100;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(userId, { limit: PAGE, offset });
    if (error || !data || data.length === 0) break;
    const paths = data.filter((o) => o.name).map((o) => `${userId}/${o.name}`);
    if (paths.length > 0) await bucket.remove(paths);
    if (data.length < PAGE) break;
  }
}
