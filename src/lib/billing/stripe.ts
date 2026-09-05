import "server-only";

// Server-only Stripe client. Instantiated lazily so importing this module never
// throws at build/collection time when env is absent — only an actual call does.

import Stripe from "stripe";
import { stripeSecretKey } from "./config";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!cached) {
    // Omit apiVersion so the SDK uses its pinned default (avoids a hard-coded
    // version drifting out of sync with the installed SDK types).
    cached = new Stripe(stripeSecretKey());
  }
  return cached;
}
