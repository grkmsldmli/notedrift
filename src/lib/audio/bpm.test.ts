// Tap-tempo tests. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { bpmFromTaps, clampBpm, median, registerTap, TAP_RESET_MS } from "./bpm.ts";

/** Build tap timestamps for a steady tempo. */
function steadyTaps(bpm: number, count: number, start = 0): number[] {
  const iv = 60000 / bpm;
  return Array.from({ length: count }, (_, i) => start + i * iv);
}

test("median", () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.ok(Number.isNaN(median([])));
});

test("bpmFromTaps: steady taps read their tempo", () => {
  assert.equal(bpmFromTaps(steadyTaps(120, 8)), 120);
  assert.equal(bpmFromTaps(steadyTaps(60, 8)), 60);
  assert.equal(bpmFromTaps(steadyTaps(128, 8)), 128);
  assert.equal(bpmFromTaps(steadyTaps(90, 5)), 90);
});

test("bpmFromTaps: needs at least two taps", () => {
  assert.equal(bpmFromTaps([]), null);
  assert.equal(bpmFromTaps([1000]), null);
});

test("bpmFromTaps: one outlier tap does not destroy the estimate (median)", () => {
  // steady 120 (500ms) but one tap lands 200ms early -> a 300ms and a 700ms interval
  const t = steadyTaps(120, 9);
  t[4] -= 200;
  const bpm = bpmFromTaps(t);
  assert.ok(bpm !== null && Math.abs(bpm - 120) <= 3, `got ${bpm}`);
});

test("bpmFromTaps: absurd intervals outside 30–300 BPM are discarded", () => {
  // one giant gap (would be < 30 BPM) is filtered out; the rest read 120
  const t = steadyTaps(120, 6);
  const withGap = [t[0], t[1], t[1] + 5000, t[1] + 5000 + 500, t[1] + 5000 + 1000];
  const bpm = bpmFromTaps(withGap);
  assert.ok(bpm !== null && Math.abs(bpm - 120) <= 3, `got ${bpm}`);
});

test("registerTap: resets the sequence after an idle gap", () => {
  let taps: number[] = [];
  taps = registerTap(taps, 0);
  taps = registerTap(taps, 500);
  assert.equal(taps.length, 2);
  // a tap far in the future starts fresh
  taps = registerTap(taps, 500 + TAP_RESET_MS + 1);
  assert.equal(taps.length, 1);
  assert.equal(bpmFromTaps(taps), null);
});

test("registerTap: keeps a bounded recent window", () => {
  let taps: number[] = [];
  for (let i = 0; i < 30; i++) taps = registerTap(taps, i * 500);
  assert.ok(taps.length <= 9); // TAP_WINDOW + 1
  assert.equal(bpmFromTaps(taps), 120);
});

test("clampBpm bounds to [30, 300]", () => {
  assert.equal(clampBpm(10), 30);
  assert.equal(clampBpm(500), 300);
  assert.equal(clampBpm(128), 128);
});
