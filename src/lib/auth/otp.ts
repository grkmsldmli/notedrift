// Pure 6-digit email OTP helpers — no DOM, no network, no Supabase, so this whole
// module is unit-tested in Node. The Supabase-calling wrapper (verifyEmailOtp)
// lives in client.ts and delegates its verification to verifyEmailOtpCore here,
// exactly like google.ts keeps parseGoogleCredential pure and lets client.ts own
// the provider call. The token is NEVER logged, stored, or placed in a URL.

import type { AuthResult } from "./types";

/** A sign-in code is always exactly this many ASCII digits. */
export const OTP_LENGTH = 6;

/**
 * Keep only ASCII digits and clamp to OTP_LENGTH. This is what makes paste
 * tolerant: "123 456", "code: 123456", "12-34-56" and a trailing newline all
 * normalize to "123456". Non-digits are dropped, never rejected mid-typing.
 */
export function normalizeOtpInput(raw: string): string {
  return (raw ?? "").replace(/\D/g, "").slice(0, OTP_LENGTH);
}

/** Whether a token is exactly OTP_LENGTH ASCII digits (nothing more, nothing less). */
export function isCompleteOtp(token: string): boolean {
  return token.length === OTP_LENGTH && /^\d+$/.test(token);
}

/** A short, human message for a verify failure — never the raw provider text.
 *  Invalid/expired is the common (and default) case; rate-limit and network are
 *  distinguished so the user knows to wait vs. retry. */
export function otpFriendlyError(message: string): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("rate") || m.includes("too many") || m.includes("limit")) {
    return "Too many attempts — please wait a moment and try again.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("connection")) {
    return "Network problem — check your connection and try again.";
  }
  // expired / invalid / bad token / anything else → the safe generic.
  return "That code is invalid or expired. Try again.";
}

/** The minimal shape verifyEmailOtpCore needs from a provider. Deliberately
 *  structural so both the real Supabase auth client and a test fake satisfy it. */
export interface OtpVerifyParams {
  email: string;
  token: string;
  type: "email";
}
export type OtpVerifier = (
  params: OtpVerifyParams,
) => Promise<{ error: { message: string } | null }>;

/**
 * Provider-agnostic email-OTP verification. Normalizes the email and token,
 * refuses to call the provider unless the token is EXACTLY six digits, then
 * verifies with type:"email". Returns a friendly AuthResult and never surfaces a
 * raw provider error. Injectable (`verify`) so it is fully unit-testable without
 * Supabase or a browser.
 */
export async function verifyEmailOtpCore(
  verify: OtpVerifier,
  email: string,
  token: string,
): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = normalizeOtpInput(token);
  if (!isCompleteOtp(cleanToken)) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }
  try {
    const { error } = await verify({ email: cleanEmail, token: cleanToken, type: "email" });
    return error ? { ok: false, error: otpFriendlyError(error.message) } : { ok: true };
  } catch {
    return { ok: false, error: "Network problem — check your connection and try again." };
  }
}
