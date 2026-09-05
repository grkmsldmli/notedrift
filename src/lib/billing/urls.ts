// Trusted return-URL derivation for Stripe redirects. The origin comes from the
// server-observed request URL (the app's own host) — NEVER from a browser-supplied
// redirect parameter (§22). The billing return param is UX only; it never grants Pro.

export function trustedOrigin(request: Request): string {
  return new URL(request.url).origin;
}
