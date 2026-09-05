// Nonce + SHA-256 helper tests (pure, Web Crypto). Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateNonce, sha256Hex } from "./nonce.ts";

test("generateNonce is URL-safe, non-empty, and unique across calls", () => {
  const a = generateNonce();
  const b = generateNonce();
  assert.match(a, /^[A-Za-z0-9_-]+$/); // URL-safe, unpadded
  assert.ok(a.length >= 40); // 32 random bytes → ~43 base64url chars
  assert.notEqual(a, b); // random
});

test("generateNonce respects the requested byte length", () => {
  const short = generateNonce(16);
  const long = generateNonce(64);
  assert.ok(short.length < long.length);
  assert.match(short, /^[A-Za-z0-9_-]+$/);
});

test("sha256Hex matches the known SHA-256 test vector for 'abc'", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("sha256Hex is 64 lowercase hex chars and deterministic", async () => {
  const nonce = generateNonce();
  const h1 = await sha256Hex(nonce);
  const h2 = await sha256Hex(nonce);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.equal(h1, h2); // deterministic — Supabase re-hashes the raw nonce to compare
});
