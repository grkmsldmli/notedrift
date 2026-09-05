// Google sign-in pure-helper tests: credential parsing + client-id detection.
// Run with `npm test`. No DOM, no network, no Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGoogleCredential } from "./google.ts";
import { googleClientId } from "./config.ts";

/* --------------------------- credential parsing --------------------------- */

test("parseGoogleCredential accepts a non-empty credential (→ signInWithIdToken path)", () => {
  const r = parseGoogleCredential({ credential: "eyJ.header.sig" });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.credential, "eyJ.header.sig");
});

test("parseGoogleCredential rejects missing/empty/nullish responses (provider error path)", () => {
  assert.equal(parseGoogleCredential({ credential: "" }).ok, false);
  assert.equal(parseGoogleCredential({}).ok, false);
  assert.equal(parseGoogleCredential(null).ok, false);
  assert.equal(parseGoogleCredential(undefined).ok, false);
  assert.equal(parseGoogleCredential({ credential: null }).ok, false);
});

/* ------------------------------- client id -------------------------------- */

test("googleClientId returns undefined when NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing/empty", () => {
  const prev = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  try {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    assert.equal(googleClientId(), undefined);
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "";
    assert.equal(googleClientId(), undefined);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = prev;
  }
});

test("googleClientId returns the configured id when present", () => {
  const prev = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  try {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "123-abc.apps.googleusercontent.com";
    assert.equal(googleClientId(), "123-abc.apps.googleusercontent.com");
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = prev;
  }
});
