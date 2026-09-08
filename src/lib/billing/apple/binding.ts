// Pure authority helpers for Apple subscription user-binding, mirroring the SQL
// apply_apple_subscription() and used by the notifications route. Keeping them pure
// makes the security rules directly unit-testable.
//
// The DB function is the enforcement point; resolveAppleUserBinding() encodes the
// SAME rule so it can be asserted in tests and read as the spec.

import type { ApplyResult } from "./reconcile";

/** The canonical user-binding decision.
 *  - Authenticated verify path (authenticatedUserId present): MAY create the first
 *    original_transaction_id -> user mapping (appAccountToken == user already
 *    enforced server-side).
 *  - Notification path (authenticatedUserId null): may ONLY reuse an EXISTING
 *    mapping. A missing mapping is "unmapped" — NEVER bind from appAccountToken. */
export function resolveAppleUserBinding(input: {
  authenticatedUserId: string | null;
  existingUserId: string | null;
}): { userId: string } | "unmapped" {
  if (input.authenticatedUserId) return { userId: input.authenticatedUserId };
  if (input.existingUserId) return { userId: input.existingUserId };
  return "unmapped";
}

/** HTTP status for an App Store Server Notification result. "unmapped" is a
 *  RETRYABLE non-2xx so Apple retries after the authenticated purchase creates the
 *  mapping; everything else is terminal (already handled). */
export function notificationHttpStatus(applied: ApplyResult): number {
  if (applied === "error") return 500;
  if (applied === "unmapped") return 503; // retryable
  return 200; // applied | duplicate | stale — terminal, ack so Apple stops retrying
}

/** Whether an outcome should make Apple retry the notification. */
export function isRetryableNotification(applied: ApplyResult): boolean {
  return notificationHttpStatus(applied) >= 500;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A NoteDrift purchase REQUIRES a valid appAccountToken (the Supabase user UUID).
 *  Mirrors the native plugin's UUID guard — defense in depth. */
export function isValidAppAccountToken(token: string | null | undefined): boolean {
  return typeof token === "string" && UUID_RE.test(token.trim());
}
