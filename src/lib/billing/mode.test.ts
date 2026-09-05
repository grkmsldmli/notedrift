// Stripe billing test/live MODE tests (pure). Run with `npm test`.
// Covers the fail-closed key/mode/origin matrix (§5, §6, §28) and the trusted
// redirect-origin rule (§12). No secrets, no network, no server-only imports.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseTrustedOrigin,
  evaluateBilling,
  expectedLivemodeForMode,
  isSecureSiteUrl,
  keyKindMatchesMode,
  normalizeBillingMode,
  stripeKeyKind,
} from "./mode.ts";

const LIVE_SITE = "https://notedrift.com";

/* ------------------------------- mode parsing ------------------------------ */

test("normalizeBillingMode: default is test; test/live accepted; junk fails closed", () => {
  assert.equal(normalizeBillingMode(undefined), "test"); // unset -> default test
  assert.equal(normalizeBillingMode(null), "test");
  assert.equal(normalizeBillingMode(""), "test");
  assert.equal(normalizeBillingMode("test"), "test");
  assert.equal(normalizeBillingMode("live"), "live");
  assert.equal(normalizeBillingMode(" LIVE "), "live"); // trimmed + case-insensitive
  assert.equal(normalizeBillingMode("sandbox"), null); // invalid -> unavailable
  assert.equal(normalizeBillingMode("prod"), null);
  assert.equal(normalizeBillingMode("production"), null);
});

test("expectedLivemodeForMode: test=false, live=true", () => {
  assert.equal(expectedLivemodeForMode("test"), false);
  assert.equal(expectedLivemodeForMode("live"), true);
});

/* --------------------------------- key kind -------------------------------- */

test("stripeKeyKind reads only the prefix", () => {
  assert.equal(stripeKeyKind("sk_test_abc"), "test");
  assert.equal(stripeKeyKind("rk_test_abc"), "test");
  assert.equal(stripeKeyKind("sk_live_abc"), "live");
  assert.equal(stripeKeyKind("rk_live_abc"), "live");
  assert.equal(stripeKeyKind("pk_test_abc"), "unknown"); // publishable, not a secret kind
  assert.equal(stripeKeyKind("whatever"), "unknown");
  assert.equal(stripeKeyKind(undefined), "unknown");
  assert.equal(stripeKeyKind(null), "unknown");
});

test("keyKindMatchesMode: test⇔test, live⇔live; unknown never matches", () => {
  assert.equal(keyKindMatchesMode("test", "test"), true);
  assert.equal(keyKindMatchesMode("live", "live"), true);
  assert.equal(keyKindMatchesMode("live", "test"), false);
  assert.equal(keyKindMatchesMode("test", "live"), false);
  assert.equal(keyKindMatchesMode("unknown", "test"), false);
  assert.equal(keyKindMatchesMode("unknown", "live"), false);
});

/* ------------------------------ secure site URL ---------------------------- */

test("isSecureSiteUrl: https non-local only", () => {
  assert.equal(isSecureSiteUrl("https://notedrift.com"), true);
  assert.equal(isSecureSiteUrl("https://www.notedrift.com"), true);
  assert.equal(isSecureSiteUrl("http://notedrift.com"), false); // not https
  assert.equal(isSecureSiteUrl("https://localhost:3000"), false);
  assert.equal(isSecureSiteUrl("http://localhost:3000"), false);
  assert.equal(isSecureSiteUrl("https://127.0.0.1"), false);
  assert.equal(isSecureSiteUrl("https://0.0.0.0"), false);
  assert.equal(isSecureSiteUrl("https://app.localhost"), false);
  assert.equal(isSecureSiteUrl(undefined), false);
  assert.equal(isSecureSiteUrl(""), false);
  assert.equal(isSecureSiteUrl("not a url"), false);
});

/* ----------------------- evaluateBilling: the §28 matrix ------------------- */

test("test mode + test key -> allowed (expected livemode false), origin/env irrelevant", () => {
  const r = evaluateBilling({ modeRaw: "test", keyKind: "test", nodeEnv: "development", siteUrl: undefined });
  assert.deepEqual(r, { ok: true, mode: "test", expectedLivemode: false });
});

test("test mode + live key -> reject (mismatch)", () => {
  const r = evaluateBilling({ modeRaw: "test", keyKind: "live", nodeEnv: "development", siteUrl: undefined });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "stripe_key_mode_mismatch");
});

test("test mode + unknown key -> reject (fail closed, never guess)", () => {
  const r = evaluateBilling({ modeRaw: "test", keyKind: "unknown", nodeEnv: "development", siteUrl: undefined });
  assert.equal(r.ok === false && r.reason, "stripe_key_mode_mismatch");
});

test("live mode + live key + production + secure origin -> allowed (expected livemode true)", () => {
  const r = evaluateBilling({ modeRaw: "live", keyKind: "live", nodeEnv: "production", siteUrl: LIVE_SITE });
  assert.deepEqual(r, { ok: true, mode: "live", expectedLivemode: true });
});

test("live mode + test key -> reject (mismatch), even in production", () => {
  const r = evaluateBilling({ modeRaw: "live", keyKind: "test", nodeEnv: "production", siteUrl: LIVE_SITE });
  assert.equal(r.ok === false && r.reason, "stripe_key_mode_mismatch");
});

test("live mode + live key + localhost -> reject (insecure origin)", () => {
  const r = evaluateBilling({ modeRaw: "live", keyKind: "live", nodeEnv: "production", siteUrl: "http://localhost:3000" });
  assert.equal(r.ok === false && r.reason, "live_requires_secure_site_url");
});

test("live mode + live key + development NODE_ENV -> reject", () => {
  const r = evaluateBilling({ modeRaw: "live", keyKind: "live", nodeEnv: "development", siteUrl: LIVE_SITE });
  assert.equal(r.ok === false && r.reason, "live_requires_production");
});

test("live mode + live key + production + http origin -> reject (insecure)", () => {
  const r = evaluateBilling({ modeRaw: "live", keyKind: "live", nodeEnv: "production", siteUrl: "http://notedrift.com" });
  assert.equal(r.ok === false && r.reason, "live_requires_secure_site_url");
});

test("invalid mode -> reject regardless of key/env", () => {
  const r = evaluateBilling({ modeRaw: "sandbox", keyKind: "live", nodeEnv: "production", siteUrl: LIVE_SITE });
  assert.equal(r.ok === false && r.reason, "invalid_billing_mode");
});

test("a live key never *infers* live mode: default(test) + live key is rejected, not silently promoted", () => {
  const r = evaluateBilling({ modeRaw: undefined, keyKind: "live", nodeEnv: "production", siteUrl: LIVE_SITE });
  // mode defaults to test; a live key in test mode is a mismatch (never becomes live)
  assert.equal(r.ok === false && r.mode, "test");
  assert.equal(r.ok === false && r.reason, "stripe_key_mode_mismatch");
});

/* ---------------------- chooseTrustedOrigin (§12) -------------------------- */

test("live: always the configured canonical origin, never the request Host", () => {
  assert.equal(
    chooseTrustedOrigin("live", "https://evil.example.com", LIVE_SITE),
    "https://notedrift.com",
  );
  // request origin is completely ignored in live mode
  assert.equal(chooseTrustedOrigin("live", "http://localhost:3000", LIVE_SITE), "https://notedrift.com");
});

test("live with no configured origin -> null (caller errors, never emits a bad redirect)", () => {
  assert.equal(chooseTrustedOrigin("live", "https://evil.example.com", null), null);
  assert.equal(chooseTrustedOrigin("live", "https://evil.example.com", undefined), null);
});

test("test: prefers the request origin, falls back to configured", () => {
  assert.equal(chooseTrustedOrigin("test", "http://localhost:3000/x?y=1", LIVE_SITE), "http://localhost:3000");
  assert.equal(chooseTrustedOrigin("test", null, LIVE_SITE), "https://notedrift.com");
  assert.equal(chooseTrustedOrigin("test", "not a url", LIVE_SITE), "https://notedrift.com");
  assert.equal(chooseTrustedOrigin("test", null, null), null);
});
