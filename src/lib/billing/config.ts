import "server-only";

// Server-only billing configuration. Reads Stripe + Supabase SECRET material from
// the environment. NONE of these use the NEXT_PUBLIC_ prefix, so Next never
// inlines them into the client bundle; the "server-only" import above makes any
// accidental client import fail the build. Values are read lazily inside the
// accessors (never at module scope, never logged) and never returned to the browser.

import type { BillingInterval } from "./types";
import {
  evaluateBilling,
  keyKindMatchesMode,
  normalizeBillingMode,
  stripeKeyKind,
  type BillingMode,
} from "./mode";

/** Required for checkout/portal/entitlement. STRIPE_WEBHOOK_SECRET is required
 *  only by the webhook route and checked separately. */
const REQUIRED = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

/** The NAMES (never values) of any required billing env vars that are absent. */
export function missingBillingConfig(): string[] {
  return REQUIRED.filter((name) => !process.env[name]);
}

export function isBillingConfigured(): boolean {
  return missingBillingConfig().length === 0;
}

/** The configured Stripe billing mode. Default "test"; an INVALID value falls
 *  back to "test" for messaging only — billingModeReason() reports it unavailable,
 *  so routes fail closed before doing anything mode-sensitive. Never NEXT_PUBLIC_. */
export function billingMode(): BillingMode {
  return normalizeBillingMode(process.env.STRIPE_BILLING_MODE) ?? "test";
}

/** The livemode flag every trusted Stripe object/event must satisfy:
 *  session/subscription/price/event.livemode === expectedStripeLivemode(). */
export function expectedStripeLivemode(): boolean {
  return billingMode() === "live";
}

/** Evaluate mode/key/origin consistency against the real environment. */
function billingEvaluation() {
  return evaluateBilling({
    modeRaw: process.env.STRIPE_BILLING_MODE,
    keyKind: stripeKeyKind(process.env.STRIPE_SECRET_KEY),
    nodeEnv: process.env.NODE_ENV,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

/** null when the billing mode, Stripe key and (in live) origin/NODE_ENV are all
 *  consistent; otherwise a stable reason CODE (never a secret). Routes treat a
 *  non-null result as "billing unavailable" and fail closed. This is the guard
 *  that refuses to run live billing on localhost, in dev, or with a mismatched
 *  key — and refuses to run at all under an invalid STRIPE_BILLING_MODE. */
export function billingModeReason(): string | null {
  const e = billingEvaluation();
  return e.ok ? null : e.reason;
}

export function hasWebhookSecret(): boolean {
  return !!process.env.STRIPE_WEBHOOK_SECRET;
}

export function stripeSecretKey(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not configured");
  // Real-money safety: the key MUST match the explicitly-configured mode. A test
  // key is refused in live mode and a live key in test mode, so a mismatched key
  // can never construct a Stripe client even if a caller skipped billingModeReason().
  // The error names the mismatch, never the key value.
  if (!keyKindMatchesMode(stripeKeyKind(k), billingMode())) {
    throw new Error("STRIPE_SECRET_KEY does not match STRIPE_BILLING_MODE");
  }
  return k;
}

export function webhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return s;
}

export function supabaseSecretKey(): string {
  const k = process.env.SUPABASE_SECRET_KEY;
  if (!k) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return k;
}

export function supabaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return u;
}

/** The CONFIGURED approved-price identifier for an interval — either a Stripe
 *  Price id (`price_...`) or a Product id (`prod_...`). Resolution to a concrete
 *  Price id + the reverse allowlist live in ./prices (they need the Stripe API).
 *  The browser only ever chooses the interval; the server maps it to a price. */
export function configuredPriceId(interval: BillingInterval): string {
  const id =
    interval === "monthly"
      ? process.env.STRIPE_PRICE_PRO_MONTHLY
      : process.env.STRIPE_PRICE_PRO_YEARLY;
  if (!id) throw new Error(`Missing approved price/product id for interval "${interval}"`);
  return id;
}
