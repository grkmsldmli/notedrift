// Explicit, fail-closed Stripe billing MODE (test | live). Pure logic only — NO
// secrets and NO `server-only` import, so it is unit-tested directly and shared.
// config.ts (server-only) glues the real environment onto these functions.
//
// The invariants this module encodes (see AGENTS/phase 3.0A §4–8, §12):
//   * STRIPE_BILLING_MODE selects the mode; default "test"; only "test"/"live"
//     are valid, anything else fails CLOSED (billing unavailable).
//   * The Stripe secret key must match the mode: test mode ⇒ sk_test_/rk_test_
//     only; live mode ⇒ sk_live_/rk_live_ only. A live key never *infers* live
//     mode — mode is chosen explicitly and the key is validated against it.
//   * LIVE additionally requires NODE_ENV=production and a secure canonical site
//     URL (https, never localhost/127.0.0.1). Any inconsistency ⇒ unavailable.
//   * expectedLivemode() = (mode === "live"); every trusted Stripe object/event
//     must satisfy object.livemode === expectedLivemode().
//   * Trusted redirect origins: live ALWAYS uses the configured canonical origin
//     (never a request-supplied Host); test may use the request origin (localhost).

export type BillingMode = "test" | "live";

export type StripeKeyKind = "test" | "live" | "unknown";

/** Stable reason CODES for why billing is unavailable. These are categories, never
 *  secret values — safe to return to a client or write to a log. */
export type BillingUnavailableReason =
  | "invalid_billing_mode"
  | "stripe_key_mode_mismatch"
  | "live_requires_production"
  | "live_requires_secure_site_url";

export type BillingEvaluation =
  | { ok: true; mode: BillingMode; expectedLivemode: boolean }
  | { ok: false; mode: BillingMode | null; reason: BillingUnavailableReason };

/** Normalize STRIPE_BILLING_MODE. Unset/empty ⇒ "test" (the default). "test"/"live"
 *  (case/space-insensitive) pass through. ANY other non-empty value ⇒ null, which
 *  the caller must treat as "billing unavailable" — never as a silent fallback. */
export function normalizeBillingMode(raw: string | undefined | null): BillingMode | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return "test";
  if (v === "test") return "test";
  if (v === "live") return "live";
  return null;
}

/** The mode a Stripe secret/restricted key belongs to, by prefix only. Reads just
 *  the prefix (never logs or returns the key). Unknown prefix ⇒ "unknown". */
export function stripeKeyKind(key: string | undefined | null): StripeKeyKind {
  const k = key ?? "";
  if (k.startsWith("sk_test") || k.startsWith("rk_test")) return "test";
  if (k.startsWith("sk_live") || k.startsWith("rk_live")) return "live";
  return "unknown";
}

/** Does a key of this kind match the configured mode? test⇔test, live⇔live only.
 *  "unknown" never matches — we fail closed rather than guess. */
export function keyKindMatchesMode(kind: StripeKeyKind, mode: BillingMode): boolean {
  return mode === "test" ? kind === "test" : kind === "live";
}

/** The livemode flag every trusted Stripe object/event must carry in this mode. */
export function expectedLivemodeForMode(mode: BillingMode): boolean {
  return mode === "live";
}

/** Whether a site URL is a secure PRODUCTION origin: https and not a local host.
 *  Used to gate LIVE mode (§5 forbids localhost/127.0.0.1/http origins). */
export function isSecureSiteUrl(siteUrl: string | undefined | null): boolean {
  if (!siteUrl) return false;
  let u: URL;
  try {
    u = new URL(siteUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return false;
  if (h === "127.0.0.1" || h === "0.0.0.0" || h === "::1" || h === "[::1]") return false;
  return true;
}

/** The core fail-closed decision. Takes already-classified inputs (so it stays
 *  pure and testable) and returns whether billing is available in the requested
 *  mode plus the expected livemode. Never returns a secret. */
export function evaluateBilling(input: {
  modeRaw: string | undefined | null;
  keyKind: StripeKeyKind;
  nodeEnv: string | undefined | null;
  siteUrl: string | undefined | null;
}): BillingEvaluation {
  const mode = normalizeBillingMode(input.modeRaw);
  if (mode === null) return { ok: false, mode: null, reason: "invalid_billing_mode" };

  if (!keyKindMatchesMode(input.keyKind, mode)) {
    return { ok: false, mode, reason: "stripe_key_mode_mismatch" };
  }

  if (mode === "live") {
    if ((input.nodeEnv ?? "") !== "production") {
      return { ok: false, mode, reason: "live_requires_production" };
    }
    if (!isSecureSiteUrl(input.siteUrl)) {
      return { ok: false, mode, reason: "live_requires_secure_site_url" };
    }
  }

  return { ok: true, mode, expectedLivemode: expectedLivemodeForMode(mode) };
}

function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Choose the trusted origin for a Stripe redirect. LIVE never trusts the
 *  request Host — it always uses the configured canonical origin (or null if that
 *  is missing, which the caller treats as an error). TEST prefers the request
 *  origin (localhost dev) and falls back to the configured one. */
export function chooseTrustedOrigin(
  mode: BillingMode,
  requestOrigin: string | null | undefined,
  configuredOrigin: string | null | undefined,
): string | null {
  const configured = normalizeOrigin(configuredOrigin);
  if (mode === "live") return configured;
  return normalizeOrigin(requestOrigin) ?? configured;
}
