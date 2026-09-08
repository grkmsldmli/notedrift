// Apple IAP + unified-entitlement logic. Pure units (the SDK verification, the DB
// is_pro()/get_billing_status() and the route auth are exercised on-device / in
// Postgres, not here). Covers the security invariants the spec requires.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPLE_BUNDLE_ID,
  APPLE_PRODUCT_IDS,
  APPLE_PRODUCT_ID_LIST,
  appleProductIdFor,
  intervalForAppleProduct,
  isApprovedAppleProduct,
} from "./products.ts";
import {
  toAppleEntitlement,
  appleEntitlementGrantsPro,
  type AppleTransactionLike,
} from "./entitlement.ts";
import { appAccountTokenMatches, appleBundleAllowed } from "./guards.ts";
import { appleIapAllowed, stripeCheckoutAllowed } from "../gate.ts";
import { extractBearerToken } from "../../http/bearer.ts";

const USER = "6f9619ff-8b86-d011-b42d-00cf4fc964ff";
const OTHER = "11111111-1111-1111-1111-111111111111";
const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;

function tx(over: Partial<AppleTransactionLike> = {}): AppleTransactionLike {
  return {
    originalTransactionId: "2000000000000001",
    transactionId: "2000000000000009",
    bundleId: APPLE_BUNDLE_ID,
    productId: APPLE_PRODUCT_IDS.yearly,
    purchaseDate: NOW - HOUR,
    expiresDate: NOW + 365 * 24 * HOUR,
    appAccountToken: USER,
    signedDate: NOW,
    environment: "Production",
    ...over,
  };
}

/* -------- 1. native billing cannot reach Stripe (and vice-versa) -------- */

test("1. Stripe checkout allowed ONLY on web; Apple IAP ONLY on native", () => {
  assert.equal(stripeCheckoutAllowed("stripe"), true);
  assert.equal(stripeCheckoutAllowed("apple"), false); // native never reaches Stripe
  assert.equal(appleIapAllowed("apple"), true);
  assert.equal(appleIapAllowed("stripe"), false); // web never reaches Apple IAP
});

/* -------- 2. Apple product allowlist -------- */

test("2. only the two canonical products are approved", () => {
  assert.deepEqual([...APPLE_PRODUCT_ID_LIST], [
    "com.notedrift.app.pro.monthly",
    "com.notedrift.app.pro.yearly",
  ]);
  assert.equal(isApprovedAppleProduct(APPLE_PRODUCT_IDS.monthly), true);
  assert.equal(isApprovedAppleProduct(APPLE_PRODUCT_IDS.yearly), true);
  assert.equal(isApprovedAppleProduct("com.notedrift.app.pro.lifetime"), false);
  assert.equal(isApprovedAppleProduct("com.evil.app.pro.monthly"), false);
  assert.equal(isApprovedAppleProduct(undefined), false);
  assert.equal(intervalForAppleProduct(APPLE_PRODUCT_IDS.monthly), "monthly");
  assert.equal(intervalForAppleProduct(APPLE_PRODUCT_IDS.yearly), "yearly");
  assert.equal(intervalForAppleProduct("junk"), null);
  assert.equal(appleProductIdFor("monthly"), APPLE_PRODUCT_IDS.monthly);
});

/* -------- 3. bearer user derivation (token extraction) -------- */

test("3. bearer token is extracted from the Authorization header only", () => {
  assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(extractBearerToken("bearer   spaced.token  "), "spaced.token");
  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken(""), null);
  assert.equal(extractBearerToken(null), null);
});

/* -------- 4. Apple entitlement selection: interval / token / env passthrough -- */

test("4. a valid active transaction maps to an active entitlement", () => {
  const e = toAppleEntitlement(tx(), undefined, NOW)!;
  assert.equal(e.status, "active");
  assert.equal(e.billingInterval, "yearly");
  assert.equal(e.appAccountToken, USER);
  assert.equal(e.environment, "Production");
  assert.equal(e.productId, APPLE_PRODUCT_IDS.yearly);
  assert.ok(appleEntitlementGrantsPro(e, NOW));
});

test("4b. monthly product yields a monthly interval; Sandbox env is preserved", () => {
  const e = toAppleEntitlement(
    tx({ productId: APPLE_PRODUCT_IDS.monthly, environment: "Sandbox" }),
    undefined,
    NOW,
  )!;
  assert.equal(e.billingInterval, "monthly");
  assert.equal(e.environment, "Sandbox");
});

/* -------- 5. Stripe OR Apple => Pro (the Apple half of the union) -------- */

test("5. an active, unrevoked, unexpired Apple entitlement grants Pro", () => {
  const e = toAppleEntitlement(tx(), undefined, NOW)!;
  assert.equal(appleEntitlementGrantsPro(e, NOW), true);
});

/* -------- 6. expired Apple => not Pro -------- */

test("6. an expired Apple subscription does NOT grant Pro", () => {
  const e = toAppleEntitlement(tx({ expiresDate: NOW - HOUR }), undefined, NOW)!;
  assert.equal(e.status, "expired");
  assert.equal(appleEntitlementGrantsPro(e, NOW), false);
});

test("6b. grace period keeps Pro past the raw expiry", () => {
  const e = toAppleEntitlement(
    tx({ expiresDate: NOW - HOUR }),
    { isInBillingRetryPeriod: true, gracePeriodExpiresDate: NOW + 3 * 24 * HOUR },
    NOW,
  )!;
  assert.equal(e.status, "active");
  assert.equal(appleEntitlementGrantsPro(e, NOW), true);
});

/* -------- 7. revoked/refunded Apple => not Pro -------- */

test("7. a revoked (refunded) Apple transaction does NOT grant Pro", () => {
  const e = toAppleEntitlement(tx({ revocationDate: NOW - HOUR }), undefined, NOW)!;
  assert.equal(e.status, "revoked");
  assert.ok(e.revokedAt);
  assert.equal(appleEntitlementGrantsPro(e, NOW), false);
});

/* -------- 8. auto-renew off => cancel_at_period_end semantics -------- */

test("8. renewal auto-renew status maps to autoRenew", () => {
  assert.equal(toAppleEntitlement(tx(), { autoRenewStatus: 1 }, NOW)!.autoRenew, true);
  assert.equal(toAppleEntitlement(tx(), { autoRenewStatus: 0 }, NOW)!.autoRenew, false);
  // No renewal info → assume on (a bare verify).
  assert.equal(toAppleEntitlement(tx(), undefined, NOW)!.autoRenew, true);
});

/* -------- 9. wrong appAccountToken rejected -------- */

test("9. appAccountToken must equal the authenticated user (case-insensitive)", () => {
  assert.equal(appAccountTokenMatches(USER, USER), true);
  assert.equal(appAccountTokenMatches(USER.toUpperCase(), USER), true);
  assert.equal(appAccountTokenMatches(OTHER, USER), false);
  assert.equal(appAccountTokenMatches(null, USER), false);
  assert.equal(appAccountTokenMatches(USER, null), false);
});

/* -------- 10. wrong bundle rejected -------- */

test("10. only NoteDrift's bundle id is allowed", () => {
  assert.equal(appleBundleAllowed(APPLE_BUNDLE_ID), true);
  assert.equal(appleBundleAllowed("com.someoneelse.app"), false);
  assert.equal(appleBundleAllowed(undefined), false);
});

/* -------- 11. wrong product rejected (invalid entitlement inputs) -------- */

test("11. a transaction missing required ids yields no entitlement", () => {
  assert.equal(toAppleEntitlement(tx({ originalTransactionId: undefined }), undefined, NOW), null);
  assert.equal(toAppleEntitlement(tx({ productId: undefined }), undefined, NOW), null);
  // An unapproved product still maps but has a null interval (server allowlist
  // check in verify.ts is what actually rejects it).
  assert.equal(
    toAppleEntitlement(tx({ productId: "com.notedrift.app.pro.lifetime" }), undefined, NOW)!
      .billingInterval,
    null,
  );
});

/* -------- 12. transaction ordering fields carried for replay/idempotency -------- */

test("12. entitlement carries originalTransactionId + signedDate for the replay guard", () => {
  const e = toAppleEntitlement(tx({ signedDate: 12345 }), undefined, NOW)!;
  assert.equal(e.originalTransactionId, "2000000000000001");
  assert.equal(e.latestTransactionId, "2000000000000009");
  assert.equal(e.signedDate, 12345);
});
