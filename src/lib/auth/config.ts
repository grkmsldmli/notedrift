// Supabase configuration detection.
//
// Both values here are BROWSER-SAFE: the URL is public, and the anon key is
// explicitly designed to be shipped to clients — it grants nothing on its own
// and is protected by Row Level Security on the server. The service-role key is
// NEVER used anywhere in this app and must never reach the client bundle.
//
// When these env vars are absent the app runs fully anonymous and local-first:
// no auth client is created and no auth UI is shown (see AccountButton).

// Referenced as literal `process.env.NEXT_PUBLIC_*` so Next inlines them; when
// unset they inline to `undefined`.
const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseUrl(): string | undefined {
  return URL_ENV && URL_ENV.length > 0 ? URL_ENV : undefined;
}

export function supabaseAnonKey(): string | undefined {
  return ANON_ENV && ANON_ENV.length > 0 ? ANON_ENV : undefined;
}

/** True only when both browser-safe Supabase env vars are present. Everything
 *  auth-related is gated on this — false means fully anonymous/local-first. */
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl() && !!supabaseAnonKey();
}
