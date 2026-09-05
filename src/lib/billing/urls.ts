// Trusted return-URL derivation for Stripe redirects (§12 production origin safety).
//
//   * LIVE mode: ALWAYS the configured canonical origin (NEXT_PUBLIC_SITE_URL) —
//     never a browser-supplied Host/Origin header, so an attacker can't redirect a
//     production checkout to their own domain.
//   * TEST mode: prefer the server-observed request origin (localhost dev), falling
//     back to the configured origin.
//
// The billing return query param is UX only; it never grants Pro.

import { billingMode } from "./config";
import { chooseTrustedOrigin } from "./mode";

export function trustedOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? null;
  const origin = chooseTrustedOrigin(billingMode(), safeRequestOrigin(request), configured);
  if (!origin) {
    // Live mode with no configured canonical origin. billingModeReason() already
    // marks billing unavailable in that case, so this is defensive — never emit a
    // Stripe redirect to an untrusted or empty origin.
    throw new Error("No trusted origin configured for Stripe redirect");
  }
  return origin;
}

function safeRequestOrigin(request: Request): string | null {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}
