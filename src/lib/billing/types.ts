// Shared billing types — safe on client AND server (no secrets, no server-only
// imports). Mirrors the sanitized get_billing_status() RPC row.

export type BillingInterval = "monthly" | "yearly";

/** Sanitized, current-user billing status. The only billing shape the browser
 *  ever sees. `plan` here is only ever "free" or "pro" (a signed-in user); the
 *  app maps the no-user case to "anonymous" separately. */
export interface BillingStatus {
  plan: "free" | "pro";
  subscriptionStatus: string | null;
  billingInterval: BillingInterval | null;
  currentPeriodEnd: string | null; // ISO timestamp
  cancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
}

/** A safe default for signed-in users with no billing rows yet. */
export const FREE_BILLING_STATUS: BillingStatus = {
  plan: "free",
  subscriptionStatus: null,
  billingInterval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canManageBilling: false,
};
