// Startup-decision tests for the anonymous fresh-session rule (scenarios A/B/D
// from the spec, as pure logic — the DOM-bound effect can't run in node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planStartup } from "./startup.ts";

test("identity loading → wait (never touch storage before auth resolves)", () => {
  assert.deepEqual(
    planStartup({ authStatus: "loading", signedIn: false, anonSessionStarted: false }),
    { kind: "wait" },
  );
  assert.deepEqual(
    planStartup({ authStatus: "loading", signedIn: true, anonSessionStarted: true }),
    { kind: "wait" },
  );
});

test("A — signed out + fresh browser session → new blank page", () => {
  assert.deepEqual(
    planStartup({ authStatus: "ready", signedIn: false, anonSessionStarted: false }),
    { kind: "new-blank" },
  );
});

test("B — signed out + same session (refresh) → restore, no new page", () => {
  assert.deepEqual(
    planStartup({ authStatus: "ready", signedIn: false, anonSessionStarted: true }),
    { kind: "restore" },
  );
});

test("D — signed in → always restore (regardless of session marker)", () => {
  assert.deepEqual(
    planStartup({ authStatus: "ready", signedIn: true, anonSessionStarted: false }),
    { kind: "restore" },
  );
  assert.deepEqual(
    planStartup({ authStatus: "ready", signedIn: true, anonSessionStarted: true }),
    { kind: "restore" },
  );
});
