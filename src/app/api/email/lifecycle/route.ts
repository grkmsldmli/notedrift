// Authenticated, idempotent lifecycle-email trigger. The client fires this at
// natural moments — after first sign-in (welcome), when a Free user opens a Pro
// export (export-intent) or hits the cloud cap (cloud-limit), and once Pro is
// active (pro-welcome). The SERVER decides whether to actually send: transactional
// kinds always send; marketing kinds (export-intent, cloud-limit) require opt-in;
// and each is sent at most once. Best-effort — never blocks the user's action.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { sendKindOnce } from "@/lib/email/dispatch";
import type { EmailKind } from "@/lib/email/templates";

// Only client-triggerable kinds are allowed here (no arbitrary send).
const ALLOWED: ReadonlySet<EmailKind> = new Set<EmailKind>([
  "welcome",
  "pro-welcome",
  "export-intent",
  "cloud-limit",
]);

export async function POST(request: Request): Promise<Response> {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let event: unknown;
  try {
    event = ((await request.json()) as { event?: unknown }).event;
  } catch {
    event = undefined;
  }
  if (typeof event !== "string" || !ALLOWED.has(event as EmailKind)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  const result = await sendKindOnce({ kind: event as EmailKind, userId: user.id, email: user.email });
  return NextResponse.json({ ok: true, result });
}
