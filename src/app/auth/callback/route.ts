// OAuth / magic-link callback. Establishes the session cookie, then returns the
// user to the editor. Supports BOTH:
//   * token_hash + type  -> verifyOtp (stateless — works in ANY browser/device,
//     so a magic link opened somewhere other than where it was requested still
//     signs in). This is the robust path for email links.
//   * code               -> exchangeCodeForSession (PKCE; OAuth and code-style
//     magic links — requires the verifier from the SAME browser that started it).
//
// Never opens an arbitrary redirect: the destination is always this app's own
// origin, and any `next` must be an internal path. On failure we still land on
// the editor (never a blank page) with `?auth=link_error` so the UI can explain,
// and local canvases are untouched (they live in the browser, not here).

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/auth/server";

/** Only allow same-site internal paths as a return target (no open redirect). */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!/^\/(?![/\\])/.test(raw)) return "/"; // must be "/…" but not "//" or "/\"
  return raw;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = await createServerSupabase();
  if (supabase) {
    // Prefer the stateless token_hash path (email links from any browser).
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
    // OAuth / PKCE code exchange.
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Expired/used link, wrong browser for a PKCE link, or not configured.
  return NextResponse.redirect(`${origin}/?auth=link_error`);
}
