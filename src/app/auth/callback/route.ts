// OAuth / magic-link callback. Exchanges the auth `code` for a session cookie,
// then returns the user to the editor. Never opens an arbitrary redirect: the
// destination is always this app's own origin, and any `next` is required to be
// an internal path. On any failure we still land on the editor — never a blank
// page, and local canvases are untouched (they live in the browser, not here).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";

/** Only allow same-site internal paths as a return target (no open redirect). */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  // Must start with a single "/" and not with "//" or "/\" (protocol-relative).
  if (!/^\/(?![/\\])/.test(raw)) return "/";
  return raw;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }
  // No code, not configured, or exchange failed → back to the editor calmly.
  return NextResponse.redirect(`${origin}/`);
}
