// GET/POST the signed-in user's email marketing preference. The opt-in is NEVER
// pre-checked (default false); this route is how the UI reads it and how a
// checked box is persisted. Writes go through the service-role store; the client
// only ever sends a boolean.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { ensurePreferences, setMarketingOptIn } from "@/lib/email/store";

async function requireUser() {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  return user?.email ? { id: user.id, email: user.email } : null;
}

export async function GET(): Promise<Response> {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prefs = await ensurePreferences(user.id, user.email);
  return NextResponse.json({ marketingOptIn: prefs.marketingOptIn });
}

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let optIn = false;
  try {
    const body = (await request.json()) as { marketingOptIn?: unknown };
    optIn = body?.marketingOptIn === true;
  } catch {
    /* default false */
  }
  const prefs = await setMarketingOptIn(user.id, user.email, optIn);
  return NextResponse.json({ ok: true, marketingOptIn: prefs.marketingOptIn });
}
