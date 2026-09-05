// Pure reconciliation-ordering helpers — no secrets, no `server-only` import, so
// they are unit-testable and shared. The KEY invariant: reconciliation and webhook
// events must be ordered on the SAME clock. Webhooks carry Stripe's `event.created`
// (Stripe's clock); reconciliation therefore stamps its ordering timestamp from
// STRIPE's clock too (the `Date` response header) — NEVER the local app-server
// clock, whose skew could otherwise reject a legitimate later Stripe event as stale.

export type ReconcileResult = "reconciled" | "skipped_newer" | "error";

/** Parse an HTTP `Date` header (Stripe's server clock) to unix seconds, or null if
 *  absent/unparseable. Reconciliation must fail safe (not write) when this is null,
 *  rather than substitute the local clock. */
export function parseHttpDateSeconds(dateHeader: string | undefined | null): number | null {
  if (!dateHeader) return null;
  const ms = Date.parse(dateHeader);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** Whether reconciliation should WRITE, given the row's stored `last_event_created`
 *  and the reconciliation ordering timestamp (both on Stripe's clock).
 *
 *  Skip when the stored value is at-or-after the reconciliation time: any webhook
 *  event that landed at-or-after this moment is authoritative and must not be
 *  overwritten. The `>=` (rather than `>`) makes a same-second cancellation webhook
 *  win over a concurrent reconciliation — cancellation immediately after checkout
 *  always wins. A strictly-older stored value is stale relative to the current
 *  Stripe truth we fetched, so we (re)write. */
export function shouldReconcileWrite(
  existingLastEventCreated: number | null | undefined,
  orderingTs: number,
): boolean {
  if (existingLastEventCreated == null) return true;
  return Number(existingLastEventCreated) < orderingTs;
}

/** Map the DB read/decision/write outcomes to a ReconcileResult. Any read or write
 *  error is a FAILURE — never claim success when persistence failed. */
export function reconcileOutcome(opts: {
  readError: boolean;
  writeNeeded: boolean;
  writeError: boolean;
}): ReconcileResult {
  if (opts.readError) return "error";
  if (!opts.writeNeeded) return "skipped_newer";
  return opts.writeError ? "error" : "reconciled";
}

/** Would a webhook event with `eventCreated` be applied over a row whose stored
 *  ordering value is `storedLastEventCreated`? Mirrors the server RPC rule (apply
 *  when event.created >= stored; stale only when strictly older). Exposed so the
 *  ordering guarantee can be asserted against reconciliation's stamp in tests. */
export function webhookWouldApply(
  eventCreated: number,
  storedLastEventCreated: number | null | undefined,
): boolean {
  if (storedLastEventCreated == null) return true;
  return eventCreated >= Number(storedLastEventCreated);
}
