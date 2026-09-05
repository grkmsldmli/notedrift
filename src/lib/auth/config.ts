// Supabase configuration detection.
//
// Both values here are BROWSER-SAFE: the URL is public, and the key below is a
// publishable/anon key explicitly designed to be shipped to clients — it grants
// nothing on its own and is governed by Row Level Security on the server. The
// Supabase SECRET / service-role key is NEVER used anywhere in this app and must
// never reach the client bundle.
//
// When these env vars are absent the app runs fully anonymous and local-first:
// no auth client is created and no auth UI is shown (see AccountButton).

// Referenced as literal `process.env.NEXT_PUBLIC_*` so Next inlines them; when
// unset they inline to `undefined`.
const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase's newer publishable key (`sb_publishable_…`) is preferred; the legacy
// anon (JWT) key is accepted as a fallback so either naming works.
const PUBLISHABLE_ENV = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ANON_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseUrl(): string | undefined {
  return URL_ENV && URL_ENV.length > 0 ? URL_ENV : undefined;
}

/** The browser-safe Supabase key. Prefers the modern publishable key
 *  (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); the legacy anon key is a documented
 *  fallback for older projects. Both are safe to expose to the client. */
export function supabasePublishableKey(): string | undefined {
  const k = PUBLISHABLE_ENV || ANON_ENV;
  return k && k.length > 0 ? k : undefined;
}

/** True only when both browser-safe Supabase env vars are present. Everything
 *  auth-related is gated on this — false means fully anonymous/local-first. */
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl() && !!supabasePublishableKey();
}

/** The NoteDrift Google OAuth *Web Client ID* — browser-safe and PUBLIC (it is
 *  designed to be shipped to clients; the Google Client SECRET lives only in the
 *  Supabase provider config and never reaches the browser). Read at call time so
 *  Next inlines `process.env.NEXT_PUBLIC_*`. Returns undefined when unset. */
export function googleClientId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return id && id.length > 0 ? id : undefined;
}

/** True only when Google Identity Services sign-in can be offered: Supabase must
 *  be configured (to exchange the ID token) AND a Google Web Client ID present.
 *  When false, the Google button is simply hidden — we NEVER fall back to the
 *  Supabase hosted OAuth redirect. */
export function isGoogleAuthConfigured(): boolean {
  return isSupabaseConfigured() && !!googleClientId();
}
