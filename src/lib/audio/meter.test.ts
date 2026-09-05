// Sound Meter signal-processing tests. These verify the MATH — not real-world dB
// SPL accuracy, which an uncalibrated browser mic cannot provide. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accumulate,
  clampCalibration,
  DBFS_TO_DISPLAY_OFFSET,
  dbFromSamples,
  EMPTY_STATS,
  estimatedDb,
  ewma,
  levelLabel,
  rms,
  rmsToDbfs,
} from "./meter.ts";

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

test("rms: silence is 0; constant amplitude equals |amplitude|", () => {
  assert.equal(rms(new Float32Array(1024)), 0);
  const half = new Float32Array(512).fill(0.5);
  assert.ok(approx(rms(half), 0.5));
  // full-scale square wave -> rms 1
  const sq = new Float32Array([1, -1, 1, -1]);
  assert.ok(approx(rms(sq), 1));
});

test("rms: known RMS of a value set", () => {
  // samples [0.3, -0.4]; mean square = (0.09 + 0.16)/2 = 0.125; rms = sqrt(0.125)
  assert.ok(approx(rms([0.3, -0.4]), Math.sqrt(0.125)));
});

test("rmsToDbfs: full scale is 0 dBFS; silence is -Infinity; half is ~-6 dBFS", () => {
  assert.equal(rmsToDbfs(1), 0);
  assert.equal(rmsToDbfs(0), -Infinity);
  assert.ok(Math.abs(rmsToDbfs(0.5) - -6.0206) < 1e-3);
});

test("estimatedDb: silence floors to 0; offset + calibration applied and clamped", () => {
  assert.equal(estimatedDb(-Infinity), 0); // silence
  assert.equal(estimatedDb(0), Math.min(DBFS_TO_DISPLAY_OFFSET, 130)); // 0 dBFS -> offset
  assert.equal(estimatedDb(-40, 0), -40 + DBFS_TO_DISPLAY_OFFSET); // 54
  assert.equal(estimatedDb(-40, 10), -40 + DBFS_TO_DISPLAY_OFFSET + 10); // calibration
  assert.equal(estimatedDb(1000), 130); // clamp high
  assert.equal(estimatedDb(-1000), 0); // clamp low
});

test("dbFromSamples: silence -> 0", () => {
  assert.equal(dbFromSamples(new Float32Array(256)), 0);
});

test("levelLabel: descriptive bands", () => {
  assert.equal(levelLabel(20), "Very quiet");
  assert.equal(levelLabel(34.9), "Very quiet");
  assert.equal(levelLabel(45), "Quiet");
  assert.equal(levelLabel(55), "Moderate");
  assert.equal(levelLabel(70), "Loud");
  assert.equal(levelLabel(85), "Very loud");
  assert.equal(levelLabel(100), "Extremely loud");
});

test("ewma: seeds with first value, then smooths toward new", () => {
  assert.equal(ewma(null, 50, 0.2), 50);
  assert.equal(ewma(50, 60, 0.5), 55);
  assert.equal(ewma(NaN, 42, 0.3), 42);
});

test("accumulate: streaming min/max/avg; ignores non-finite", () => {
  let s = EMPTY_STATS;
  s = accumulate(s, 40);
  s = accumulate(s, 60);
  s = accumulate(s, 50);
  assert.equal(s.min, 40);
  assert.equal(s.max, 60);
  assert.ok(approx(s.avg, 50));
  assert.equal(s.count, 3);
  const before = s;
  assert.deepEqual(accumulate(s, Infinity), before); // ignored
});

test("clampCalibration: rounds + clamps to [-20, 20]; junk -> 0", () => {
  assert.equal(clampCalibration(0), 0);
  assert.equal(clampCalibration(3.4), 3);
  assert.equal(clampCalibration(-100), -20);
  assert.equal(clampCalibration(100), 20);
  assert.equal(clampCalibration(NaN), 0);
});
