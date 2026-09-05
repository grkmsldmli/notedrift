import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyCloudError,
  isDivergent,
  ownsLink,
  planSync,
  toConflict,
  toDirty,
  toError,
  toOffline,
  toSynced,
  type CloudLink,
} from "./link.ts";

function link(over: Partial<CloudLink> = {}): CloudLink {
  return {
    localId: "L1",
    cloudId: "C1",
    ownerId: "userA",
    revision: 2,
    fingerprint: "fp-1",
    syncState: "synced",
    updatedAt: 0,
    ...over,
  };
}

test("ownsLink is the cross-account guard", () => {
  assert.equal(ownsLink(link(), "userA"), true);
  assert.equal(ownsLink(link(), "userB"), false); // account switch → not owned
  assert.equal(ownsLink(link(), null), false); // signed out
});

test("isDivergent compares fingerprints", () => {
  assert.equal(isDivergent(link({ fingerprint: "fp-1" }), "fp-1"), false);
  assert.equal(isDivergent(link({ fingerprint: "fp-1" }), "fp-2"), true);
});

test("planSync picks the safe action", () => {
  const on = { uid: "userA", online: true };
  assert.equal(planSync(link(), "fp-1", on), "skip"); // unchanged
  assert.equal(planSync(link(), "fp-2", on), "sync"); // changed, owned, online
  assert.equal(planSync(link(), "fp-2", { uid: "userA", online: false }), "offline");
  assert.equal(planSync(link(), "fp-2", { uid: "userB", online: true }), "foreign"); // account B
  assert.equal(planSync(link({ syncState: "conflict" }), "fp-2", on), "blocked-conflict");
});

test("transitions never override an unresolved conflict except explicit resolve", () => {
  const c = link({ syncState: "conflict" });
  assert.equal(toDirty(c, 1).syncState, "conflict");
  assert.equal(toOffline(c, 1).syncState, "conflict");
  assert.equal(toError(c, 1).syncState, "conflict");
  // synced clears state + records the new revision/fingerprint
  const s = toSynced(c, 7, "fp-9", 1);
  assert.equal(s.syncState, "synced");
  assert.equal(s.revision, 7);
  assert.equal(s.fingerprint, "fp-9");
});

test("toDirty/toConflict set the expected states from synced", () => {
  assert.equal(toDirty(link(), 1).syncState, "dirty");
  assert.equal(toConflict(link(), 1).syncState, "conflict");
});

test("classifyCloudError maps RPC exceptions to actionable kinds", () => {
  assert.equal(classifyCloudError({ message: "revision_conflict" }), "conflict");
  assert.equal(classifyCloudError({ message: "cloud_limit_reached" }), "limit");
  assert.equal(classifyCloudError({ message: "not_found" }), "not-found");
  assert.equal(classifyCloudError({ message: "permission denied for function", code: "42501" }), "auth");
  assert.equal(classifyCloudError({ message: "Failed to fetch" }), "network");
  assert.equal(classifyCloudError({ message: "something odd" }), "unknown");
});
