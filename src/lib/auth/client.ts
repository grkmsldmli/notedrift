"use client";

// Browser-side auth. Session handling is delegated entirely to @supabase/ssr's
// cookie-based client — we never store access tokens in localStorage ourselves.
// Every function no-ops safely when Supabase isn't configured, so the app runs
// anonymous without credentials.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./config";
import type { AuthResult, AuthUser } from "./types";

let cached: SupabaseClient | null = null;

/** The browser Supabase client, or null when Supabase isn't configured. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) {
    cached = createBrowserClient(supabaseUrl()!, supabasePublishableKey()!);
  }
  return cached;
}

/** Map a Supabase user to our minimal identity shape. */
export function toAuthUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const m = (u.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  return {
    id: u.id,
    email: u.email ?? null,
    name: str(m.full_name) ?? str(m.name),
    avatarUrl: str(m.avatar_url) ?? str(m.picture),
  };
}

function callbackUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth/callback`;
}

function isValidEmail(email: string): boolean {
  // Deliberately simple: real validation is the provider sending (or not) a link.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** A short, human message from a provider error — never the raw response. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many attempts — please wait a moment and try again.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Network problem — check your connection and try again.";
  }
  return "Couldn't sign in right now. Please try again.";
}

/** Passwordless email sign-in (magic link / OTP). Creates the account if new. */
export async function signInWithEmail(email: string): Promise<AuthResult> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: "Sign-in isn't available yet." };
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  try {
    const { error } = await sb.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: callbackUrl() },
    });
    return error ? { ok: false, error: friendly(error.message) } : { ok: true };
  } catch {
    return { ok: false, error: "Network problem — please try again." };
  }
}

/** Exchange a Google Identity Services ID token for a Supabase session (direct
 *  ID-token sign-in — NOT the hosted OAuth redirect, so Google's screen shows the
 *  NoteDrift client, never the raw Supabase domain). `nonce` is the RAW nonce
 *  whose SHA-256 hash was given to Google. On success onAuthStateChange fires and
 *  the app reflects the signed-in user; no /auth/callback round-trip. */
export async function signInWithGoogleIdToken(
  credential: string,
  nonce: string,
): Promise<AuthResult> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: "Sign-in isn't available yet." };
  try {
    const { error } = await sb.auth.signInWithIdToken({
      provider: "google",
      token: credential,
      nonce,
    });
    return error ? { ok: false, error: friendly(error.message) } : { ok: true };
  } catch {
    return { ok: false, error: "Network problem — please try again." };
  }
}

export async function signOut(): Promise<void> {
  const sb = getBrowserSupabase();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch {
      /* best effort — local session cleared regardless of network */
    }
  }
}

/** Current signed-in user (network-validated), or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getUser();
    return toAuthUser(data.user);
  } catch {
    return null;
  }
}

/** Subscribe to auth changes. Fires immediately with the current session, then
 *  on every sign-in/out. Returns an unsubscribe function. No-op when unconfigured. */
export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  const sb = getBrowserSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    cb(toAuthUser(session?.user));
  });
  return () => data.subscription.unsubscribe();
}
