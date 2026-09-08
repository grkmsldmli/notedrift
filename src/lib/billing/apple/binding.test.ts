// Apple notification user-binding authority + retry semantics + purchase token
// guard. These pure helpers mirror the SQL apply_apple_subscription() and the
// native plugin guard, and are the unit-tested spec for those rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidAppAccountToken,
  isRetryableNotification,
  notificationHttpStatus,
  resolveAppleUserBinding,
} from "./binding.ts";
import { toAppleEntitlement, appleEntitlementGrantsPro } from "./entitlement.ts";
import { APPLE_PRODUCT_IDS } from "./products.ts";

const USER = "6f9619ff-8b86-d011-b42d-00cf4fc964ff";
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

/* -------- notification cannot create the first user mapping -------- */

test("a notification (no auth) with NO existing mapping is unmapped — never binds from appAccountToken", () => {
  assert.equal(
    resolveAppleUserBinding({ authenticatedUserId: null, existingUserId: null }),
    "unmapped",
  );
});

/* -------- authenticated verify CAN create the first mapping -------- */

test("the authenticated verify path may create the first mapping", () => {
  assert.deepEqual(
    resolveAppleUserBinding({ authenticatedUserId: USER, existingUserId: null }),
    { userId: USER },
  );
});

/* -------- notification may UPDATE an existing mapping -------- */

test("a notification with an existing mapping reuses that user", () => {
  assert.deepEqual(
    resolveAppleUserBinding({ authenticatedUserId: null, existingUserId: USER }),
    { userId: USER },
  );
});

/* -------- unmapped notification is retryable; others terminal -------- */

test("unmapped notification returns a retryable 503; mapped outcomes are terminal 2xx", () => {
  assert.equal(notificationHttpStatus("unmapped"), 503);
  assert.equal(isRetryableNotification("unmapped"), true);

  assert.equal(notificationHttpStatus("applied"), 200);
  assert.equal(notificationHttpStatus("duplicate"), 200); // idempotent, not reprocessed
  assert.equal(notificationHttpStatus("stale"), 200);
  assert.equal(isRetryableNotification("duplicate"), false);

  assert.equal(notificationHttpStatus("error"), 500);
  assert.equal(isRetryableNotification("error"), true);
});

/* -------- native purchase requires a valid appAccountToken -------- */

test("a purchase requires a valid UUID appAccountToken (mirrors the native guard)", () => {
  assert.equal(isValidAppAccountToken(USER), true);
  assert.equal(isValidAppAccountToken(USER.toUpperCase()), true);
  assert.equal(isValidAppAccountToken(null), false);
  assert.equal(isValidAppAccountToken(undefined), false);
  assert.equal(isValidAppAccountToken(""), false);
  assert.equal(isValidAppAccountToken("not-a-uuid"), false);
  assert.equal(isValidAppAccountToken("123"), false);
});

/* -------- existing-mapped notification renew / expire still works -------- */

function tx(over: Record<string, unknown> = {}) {
  return {
    originalTransactionId: "2000000000000001",
    transactionId: "2000000000000009",
    bundleId: "com.notedrift.app",
    productId: APPLE_PRODUCT_IDS.yearly,
    purchaseDate: NOW - DAY,
    expiresDate: NOW + 365 * DAY,
    appAccountToken: USER,
    signedDate: NOW,
    environment: "Production",
    ...over,
  };
}

test("a RENEW notification for a mapped sub keeps the user Pro", () => {
  const binding = resolveAppleUserBinding({ authenticatedUserId: null, existingUserId: USER });
  assert.deepEqual(binding, { userId: USER });
  const e = toAppleEntitlement(tx({ expiresDate: NOW + 30 * DAY }), { autoRenewStatus: 1 }, NOW)!;
  assert.equal(e.status, "active");
  assert.equal(appleEntitlementGrantsPro(e, NOW), true);
});

test("an EXPIRE notification for a mapped sub drops Pro", () => {
  const binding = resolveAppleUserBinding({ authenticatedUserId: null, existingUserId: USER });
  assert.deepEqual(binding, { userId: USER });
  const e = toAppleEntitlement(tx({ expiresDate: NOW - DAY }), undefined, NOW)!;
  assert.equal(e.status, "expired");
  assert.equal(appleEntitlementGrantsPro(e, NOW), false);
});
