// Unified request authentication for API routes that BOTH the web app (cookie
// session) and the native iOS app (Authorization: Bearer <supabase access token>)
// call. The native local origin does not share notedrift.com cookies, so it sends
// a bearer token instead.
//
// Security:
//  - The user is ALWAYS derived from the verified session/token, NEVER from the
//    request body/query. Callers get `ctx.user.id` as the only trusted identity.
//  - Access tokens are never logged.
//  - The returned `supabase` client is scoped to that user (RLS applies), suitable
//    for calling auth.uid()-scoped RPCs like get_billing_status().

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabase } from "./server";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./config";
import { extractBearerToken } from "../http/bearer";

export interface AuthedContext {
  user: User;
  /** A Supabase client scoped to this user (cookie- or token-authed). */
  supabase: SupabaseClient;
  via: "cookie" | "bearer";
  /** The bearer access token, when authenticated that way (else null). */
  accessToken: string | null;
}

/** Authenticate the request. Returns null (caller responds 401) when there is no
 *  valid session/token or Supabase isn't configured. */
export async function requireAuthenticatedUser(
  request: Request,
): Promise<AuthedContext | null> {
  const bearer = extractBearerToken(
    request.headers.get("authorization") ?? request.headers.get("Authorization"),
  );

  if (bearer) {
    if (!isSupabaseConfigured()) return null;
    // A per-request client that sends this token on every call, so RLS-scoped RPCs
    // run as the token's user. getUser(token) verifies the JWT with Supabase Auth.
    const supabase = createClient(supabaseUrl()!, supabasePublishableKey()!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data.user) return null;
    return { user: data.user, supabase, via: "bearer", accessToken: bearer };
  }

  // Web: cookie session via @supabase/ssr.
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { user: data.user, supabase, via: "cookie", accessToken: null };
}
