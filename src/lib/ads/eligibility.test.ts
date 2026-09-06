// Ad-eligibility + config pure-logic tests. Run with `npm test`. No DOM, no
// network, no AdSense. Covers the full eligibility truth table and the config
// validators (client id / slot / publisher-id derivation).
import { test } from "node:test";
import assert from "node:assert/strict";
import { adsEligible, type AdEligibilityInput } from "./eligibility.ts";
import {
  adsenseEnabled,
  adsenseClientId,
  adsConfigured,
  adsensePublisherId,
  adsenseSlotTools,
} from "./config.ts";

/* ------------------------------ eligibility ------------------------------- */

// A production-configured baseline; individual tests override one field.
const base: AdEligibilityInput = {
  configured: true,
  productionHost: true,
  authStatus: "ready",
  signedIn: false,
  billingResolved: true,
  plan: "anonymous",
};
const withInput = (o: Partial<AdEligibilityInput>) => adsEligible({ ...base, ...o });

test("anonymous + auth resolved => ADS", () => {
  assert.equal(withInput({ signedIn: false, plan: "anonymous" }), true);
});

test("Free signed-in + billing resolved => ADS", () => {
  assert.equal(withInput({ signedIn: true, billingResolved: true, plan: "free" }), true);
});

test("Pro => NO ADS", () => {
  assert.equal(withInput({ signedIn: true, billingResolved: true, plan: "pro" }), false);
});

test("auth loading => NO ADS YET", () => {
  assert.equal(withInput({ authStatus: "loading" }), false);
});

test("signed-in user + billing unresolved => NO ADS YET", () => {
  // Critical: a Pro user whose billing is still loading must not briefly see ads.
  assert.equal(withInput({ signedIn: true, billingResolved: false, plan: "free" }), false);
  assert.equal(withInput({ signedIn: true, billingResolved: false, plan: "pro" }), false);
});

test("config disabled => NO ADS", () => {
  assert.equal(withInput({ configured: false }), false);
});

test("non-production host (localhost/preview) => NO ADS", () => {
  assert.equal(withInput({ productionHost: false }), false);
  // even for an eligible Free user
  assert.equal(withInput({ productionHost: false, signedIn: true, plan: "free" }), false);
});

test("production NoteDrift Free => ADS; production NoteDrift Pro => NO ADS", () => {
  assert.equal(withInput({ signedIn: true, billingResolved: true, plan: "free" }), true);
  assert.equal(withInput({ signedIn: true, billingResolved: true, plan: "pro" }), false);
});

test("fails safe: config off beats everything", () => {
  assert.equal(withInput({ configured: false, signedIn: false, plan: "anonymous" }), false);
});

/* -------------------------------- config ---------------------------------- */

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const keys = Object.keys(vars);
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("adsenseEnabled is true ONLY for the exact string 'true'", () => {
  withEnv({ NEXT_PUBLIC_ADSENSE_ENABLED: "true" }, () => assert.equal(adsenseEnabled(), true));
  withEnv({ NEXT_PUBLIC_ADSENSE_ENABLED: "false" }, () => assert.equal(adsenseEnabled(), false));
  withEnv({ NEXT_PUBLIC_ADSENSE_ENABLED: "1" }, () => assert.equal(adsenseEnabled(), false));
  withEnv({ NEXT_PUBLIC_ADSENSE_ENABLED: undefined }, () => assert.equal(adsenseEnabled(), false));
});

test("adsenseClientId accepts a valid ca-pub id and rejects junk", () => {
  withEnv({ NEXT_PUBLIC_ADSENSE_CLIENT_ID: "ca-pub-1234567890123456" }, () =>
    assert.equal(adsenseClientId(), "ca-pub-1234567890123456"),
  );
  withEnv({ NEXT_PUBLIC_ADSENSE_CLIENT_ID: "pub-123" }, () => assert.equal(adsenseClientId(), undefined));
  withEnv({ NEXT_PUBLIC_ADSENSE_CLIENT_ID: "ca-pub-abc" }, () => assert.equal(adsenseClientId(), undefined));
  withEnv({ NEXT_PUBLIC_ADSENSE_CLIENT_ID: "" }, () => assert.equal(adsenseClientId(), undefined));
  withEnv({ NEXT_PUBLIC_ADSENSE_CLIENT_ID: undefined }, () => assert.equal(adsenseClientId(), undefined));
});

test("adsConfigured requires BOTH the kill switch and a valid client id", () => {
  withEnv({ NEXT_PUBLIC_ADSENSE_ENABLED: "true", NEXT_PUBLIC_ADSENSE_CLIENT_ID: "ca-pub-1234567890123456" }, () =>
    assert.equal(adsConfigured(), true),
  );
  withEnv({ NEXT_PUBLIC_ADSENSE_ENABLED: "false", NEXT_PUBLIC_ADSENSE_CLIENT_ID: "ca-pub-1234567890123456" }, () =>
    assert.equal(adsConfigured(), false),
  );
  withEnv({ NEXT_PUBLIC_ADSENSE_ENABLED: "true", NEXT_PUBLIC_ADSENSE_CLIENT_ID: undefined }, () =>
    assert.equal(adsConfigured(), false),
  );
});

test("adsensePublisherId derives pub-… from ca-pub-… (for ads.txt)", () => {
  withEnv({ NEXT_PUBLIC_ADSENSE_CLIENT_ID: "ca-pub-1234567890123456" }, () =>
    assert.equal(adsensePublisherId(), "pub-1234567890123456"),
  );
  withEnv({ NEXT_PUBLIC_ADSENSE_CLIENT_ID: undefined }, () =>
    assert.equal(adsensePublisherId(), undefined),
  );
});

test("slot ids must be numeric", () => {
  withEnv({ NEXT_PUBLIC_ADSENSE_SLOT_TOOLS: "1234567890" }, () => assert.equal(adsenseSlotTools(), "1234567890"));
  withEnv({ NEXT_PUBLIC_ADSENSE_SLOT_TOOLS: "abc" }, () => assert.equal(adsenseSlotTools(), undefined));
  withEnv({ NEXT_PUBLIC_ADSENSE_SLOT_TOOLS: undefined }, () => assert.equal(adsenseSlotTools(), undefined));
});
