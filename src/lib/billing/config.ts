import "server-only";

// Server-only billing configuration. Reads Stripe + Supabase SECRET material from
// the environment. NONE of these use the NEXT_PUBLIC_ prefix, so Next never
// inlines them into the client bundle; the "server-only" import above makes any
// accidental client import fail the build. Values are read lazily inside the
// accessors (never at module scope, never logged) and never returned to the browser.

import type { BillingInterval } from "./types";

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

export function hasWebhookSecret(): boolean {
  return !!process.env.STRIPE_WEBHOOK_SECRET;
}

export function stripeSecretKey(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not configured");
  // Real-money safety (§7): refuse to operate with a LIVE Stripe key. Sandbox
  // uses sk_test_ / rk_test_ keys; live uses sk_live_ / rk_live_.
  if (k.startsWith("sk_live") || k.startsWith("rk_live")) {
    throw new Error("Refusing to operate with a LIVE Stripe key — NoteDrift billing is sandbox/test only");
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
