// Plan resolution: identity → plan. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePlan } from "./plan.ts";
import type { AuthUser } from "./types.ts";

const user: AuthUser = {
  id: "u_1",
  email: "a@b.com",
  name: null,
  avatarUrl: null,
};

test("no user resolves to anonymous", () => {
  assert.equal(resolvePlan(null), "anonymous");
});

test("any signed-in user resolves to free", () => {
  assert.equal(resolvePlan(user), "free");
  assert.equal(resolvePlan({ ...user, email: null }), "free");
});

test("client identity NEVER resolves to pro", () => {
  // Whatever the identity, the resolver can only ever return anonymous or free.
  for (const u of [null, user, { ...user, email: "admin@notedrift.com" }]) {
    assert.notEqual(resolvePlan(u), "pro");
  }
});
