// Export sizing-math tests. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_EXPORT_EDGE,
  PNG_TARGET_LONG_EDGE,
  clampDimension,
  fitPixelBudget,
  outputPixels,
  pairedDimension,
  resolveScale,
  slugify,
} from "./scale.ts";

test("resolveScale: plain multiplier", () => {
  assert.equal(resolveScale(1000, 500, { scope: "canvas", background: "white", scale: 2 }), 2);
  assert.equal(resolveScale(1000, 500, { scope: "canvas", background: "white", scale: 1 }), 1);
});

test("resolveScale: targetLongEdge maps to the longer side (HD/4K)", () => {
  // 1000×500 → longest 1000; HD 2560 → 2.56×
  assert.equal(resolveScale(1000, 500, { scope: "canvas", background: "white", targetLongEdge: PNG_TARGET_LONG_EDGE.hd }), 2.56);
  // portrait 500×1000 → longest 1000; 4K 3840 → 3.84×
  assert.equal(resolveScale(500, 1000, { scope: "canvas", background: "white", targetLongEdge: PNG_TARGET_LONG_EDGE.k4 }), 3.84);
});

test("resolveScale: never exceeds the edge safety cap", () => {
  // A huge target on big content is clamped so the long edge <= MAX_EXPORT_EDGE.
  const s = resolveScale(10000, 8000, { scope: "canvas", background: "white", targetLongEdge: 100000 });
  assert.ok(10000 * s <= MAX_EXPORT_EDGE + 0.001);
});

test("resolveScale: respects the total-pixel budget", () => {
  const s = resolveScale(9000, 9000, { scope: "canvas", background: "white", scale: 10 });
  assert.ok(9000 * s * 9000 * s <= 80_000_000 + 1);
});

test("resolveScale: always positive", () => {
  assert.ok(resolveScale(0, 0, { scope: "canvas", background: "white" }) > 0);
  assert.ok(resolveScale(1000, 500, { scope: "canvas", background: "white", scale: -5 }) > 0);
});

test("outputPixels: rounds and clamps", () => {
  assert.deepEqual(outputPixels(1000, 500, 2), { width: 2000, height: 1000 });
  const big = outputPixels(10000, 10000, 5);
  assert.ok(big.width <= MAX_EXPORT_EDGE && big.height <= MAX_EXPORT_EDGE);
});

test("clampDimension: safe range + garbage handling", () => {
  assert.equal(clampDimension(500), 500);
  assert.equal(clampDimension(0), 1);
  assert.equal(clampDimension(999999), MAX_EXPORT_EDGE);
  assert.equal(clampDimension(NaN), 1);
});

test("fitPixelBudget: passes small sizes through, scales huge ones under budget", () => {
  assert.deepEqual(fitPixelBudget(1000, 800), { width: 1000, height: 800 });
  const big = fitPixelBudget(12000, 12000); // 144M > 80M budget
  assert.ok(big.width * big.height <= 80_000_000 + 1);
  // ratio preserved (square stays square)
  assert.equal(big.width, big.height);
});

test("pairedDimension: maintains aspect ratio both ways", () => {
  // content 1000×500 → aspect 2:1. Width 800 → height 400.
  assert.equal(pairedDimension("width", 800, 1000, 500), 400);
  // height 400 → width 800.
  assert.equal(pairedDimension("height", 400, 1000, 500), 800);
});

test("slugify: filename-safe base from a title", () => {
  assert.equal(slugify("My Great Canvas!"), "my-great-canvas");
  assert.equal(slugify("   "), "notedrift");
  assert.equal(slugify(""), "notedrift");
  assert.equal(slugify("a/b\\c"), "a-b-c");
});
