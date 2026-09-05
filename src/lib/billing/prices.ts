import "server-only";

// Resolves the configured approved-price identifiers to concrete Stripe PRICE ids
// and keeps a resolved allowlist (§31). The configured value for each interval may
// be a Price id (`price_...`, used directly) OR a Product id (`prod_...`, resolved
// to that product's active recurring price for the interval) — the spec allows the
// two Pro prices to live on two separate Products. Cached after first resolution.

import { getStripe } from "./stripe";
import { configuredPriceId, expectedStripeLivemode } from "./config";
import type { BillingInterval } from "./types";

interface Approved {
  monthly: string;
  yearly: string;
  all: Set<string>;
}

let cache: Approved | null = null;

async function resolveOne(configured: string, interval: BillingInterval): Promise<string> {
  const wanted = interval === "monthly" ? "month" : "year";
  const expectLive = expectedStripeLivemode();
  const stripe = getStripe();

  if (configured.startsWith("price_")) {
    // Validate the configured Price object rather than trusting the id blindly:
    // it must be active, in the EXPECTED Stripe mode (§6), and recurring on the
    // requested interval. A wrong-mode / wrong-interval / inactive price is
    // refused so it can never be charged or grant Pro.
    const price = await stripe.prices.retrieve(configured);
    if (!price.active) throw new Error(`Configured ${interval} price is not active`);
    if (price.livemode !== expectLive) {
      throw new Error(`Configured ${interval} price is in the wrong Stripe mode`);
    }
    if (price.recurring?.interval !== wanted) {
      throw new Error(`Configured ${interval} price is not a ${wanted}ly recurring price`);
    }
    return price.id;
  }

  if (configured.startsWith("prod_")) {
    const prices = await stripe.prices.list({
      product: configured,
      active: true,
      type: "recurring",
      limit: 100,
    });
    // Fail CLOSED: require an active recurring price whose interval AND mode match.
    // NEVER fall back to prices.data[0] — that could charge a yearly price for a
    // monthly checkout, or a wrong-mode price.
    const match = prices.data.find(
      (p) => p.recurring?.interval === wanted && p.livemode === expectLive,
    );
    if (!match) {
      throw new Error(
        `No active recurring ${wanted}ly ${expectLive ? "live" : "test"} price for the configured ${interval} product`,
      );
    }
    return match.id;
  }

  // Fail closed on an unrecognized id format instead of using it as-is.
  throw new Error(`Unrecognized price/product id format for the ${interval} plan`);
}

/** The resolved approved prices, cached. Throws if a configured id can't resolve. */
export async function approvedPrices(): Promise<Approved> {
  if (cache) return cache;
  const monthly = await resolveOne(configuredPriceId("monthly"), "monthly");
  const yearly = await resolveOne(configuredPriceId("yearly"), "yearly");
  cache = { monthly, yearly, all: new Set([monthly, yearly]) };
  return cache;
}

/** The resolved Price id to charge for a checkout interval. */
export async function resolvedPriceId(interval: BillingInterval): Promise<string> {
  const p = await approvedPrices();
  return interval === "monthly" ? p.monthly : p.yearly;
}

/** The interval a Stripe Price id maps to, or null if it is NOT an approved Pro
 *  price. A subscription on an unapproved price never grants Pro (§31). */
export async function approvedInterval(priceId: string | null | undefined): Promise<BillingInterval | null> {
  if (!priceId) return null;
  const p = await approvedPrices();
  if (priceId === p.monthly) return "monthly";
  if (priceId === p.yearly) return "yearly";
  return null;
}
