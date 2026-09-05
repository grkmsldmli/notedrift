// Reconciliation ordering + DB-outcome tests. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseHttpDateSeconds,
  reconcileOutcome,
  shouldReconcileWrite,
  webhookWouldApply,
} from "./ordering.ts";

/* -------------------------- Stripe-clock timestamp -------------------------- */

test("parseHttpDateSeconds parses an HTTP Date header to unix seconds", () => {
  assert.equal(parseHttpDateSeconds("Thu, 01 Jan 1970 00:00:10 GMT"), 10);
  assert.equal(parseHttpDateSeconds("Sat, 05 Sep 2026 07:00:00 GMT"), Math.floor(Date.parse("Sat, 05 Sep 2026 07:00:00 GMT") / 1000));
});

test("parseHttpDateSeconds fails safe (null) when absent/unparseable", () => {
  assert.equal(parseHttpDateSeconds(undefined), null);
  assert.equal(parseHttpDateSeconds(null), null);
  assert.equal(parseHttpDateSeconds(""), null);
  assert.equal(parseHttpDateSeconds("not a date"), null);
});

/* ---------------------------- DB write failure (issue 1) -------------------- */

test("reconcileOutcome: a DB WRITE failure is reported as error, never reconciled", () => {
  assert.equal(reconcileOutcome({ readError: false, writeNeeded: true, writeError: true }), "error");
});

test("reconcileOutcome: a DB READ failure is reported as error (can't order safely)", () => {
  assert.equal(reconcileOutcome({ readError: true, writeNeeded: false, writeError: false }), "error");
  // read error dominates even if a write was thought needed
  assert.equal(reconcileOutcome({ readError: true, writeNeeded: true, writeError: false }), "error");
});

test("reconcileOutcome: successful write -> reconciled; nothing to write -> skipped_newer", () => {
  assert.equal(reconcileOutcome({ readError: false, writeNeeded: true, writeError: false }), "reconciled");
  assert.equal(reconcileOutcome({ readError: false, writeNeeded: false, writeError: false }), "skipped_newer");
});

/* ----------------------------- write decision ------------------------------ */

test("shouldReconcileWrite: writes when there is no row or the stored value is older", () => {
  assert.equal(shouldReconcileWrite(null, 100), true);
  assert.equal(shouldReconcileWrite(undefined, 100), true);
  assert.equal(shouldReconcileWrite(50, 100), true);
});

test("shouldReconcileWrite: skips when a webhook at-or-after already applied (>= wins)", () => {
  assert.equal(shouldReconcileWrite(100, 100), false); // same-second cancellation wins
  assert.equal(shouldReconcileWrite(150, 100), false);
});

/* ---------------------- clock-skew / ordering invariants (issue 2) --------- */

test("webhookWouldApply mirrors the RPC rule (apply when event.created >= stored)", () => {
  assert.equal(webhookWouldApply(100, null), true);
  assert.equal(webhookWouldApply(100, 100), true); // tie -> the webhook (cancellation) wins
  assert.equal(webhookWouldApply(101, 100), true);
  assert.equal(webhookWouldApply(99, 100), false);
});

test("STRIPE-clock reconciliation keeps a later cancellation authoritative under server skew", () => {
  const stripeNow = 1_000_000; // reconciliation stamps this (from Stripe's Date header)
  const laterCancel = stripeNow + 1; // a real cancellation's event.created, just after
  // Correct: cancellation applies over the reconciled row.
  assert.equal(webhookWouldApply(laterCancel, stripeNow), true);
  // The bug the fix avoids: had reconciliation used a LOCAL clock running +30s
  // ahead, the same real cancellation would be wrongly rejected as stale.
  assert.equal(webhookWouldApply(laterCancel, stripeNow + 30), false);
});

test("a stale older event can never resurrect a cancelled subscription", () => {
  const cancelledAt = 2_000_000; // stored last_event_created after a cancellation
  const staleActive = cancelledAt - 5; // an older, delayed 'active' event
  assert.equal(webhookWouldApply(staleActive, cancelledAt), false);
  // and reconciliation run afterward at an EARLIER stripe time also defers
  assert.equal(shouldReconcileWrite(cancelledAt, cancelledAt - 1), false);
});
