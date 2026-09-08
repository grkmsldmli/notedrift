// Pure security guards for Apple verification, unit-tested and used by the server
// verify path. Keeping them pure makes "wrong bundle / wrong product / wrong
// appAccountToken are rejected" directly testable.

import { APPLE_BUNDLE_ID } from "./products.ts";

/** The transaction's bundleId must be exactly NoteDrift's. */
export function appleBundleAllowed(bundleId: string | null | undefined): boolean {
  return bundleId === APPLE_BUNDLE_ID;
}

/** The signed transaction's appAccountToken must equal the authenticated Supabase
 *  user id (case-insensitive UUID). A missing token never matches — we never grant
 *  Pro to a transaction that isn't bound to the account. */
export function appAccountTokenMatches(
  token: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!token || !userId) return false;
  return token.toLowerCase() === userId.toLowerCase();
}
