// Metronome timing tests. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beatIntervalSec,
  clampVolume,
  isAccent,
  nextBeatIndex,
} from "./metronome.ts";

test("beatIntervalSec: seconds per beat", () => {
  assert.equal(beatIntervalSec(120), 0.5);
  assert.equal(beatIntervalSec(60), 1);
  assert.equal(beatIntervalSec(240), 0.25);
  // clamps out-of-range BPM
  assert.equal(beatIntervalSec(10), 60 / 30);
  assert.equal(beatIntervalSec(1000), 60 / 300);
});

test("nextBeatIndex: wraps within the bar", () => {
  assert.equal(nextBeatIndex(0, 4), 1);
  assert.equal(nextBeatIndex(3, 4), 0);
  assert.equal(nextBeatIndex(2, 3), 0);
  assert.equal(nextBeatIndex(5, 6), 0);
  assert.equal(nextBeatIndex(0, 2), 1);
});

test("isAccent: only the first beat, only when enabled", () => {
  assert.equal(isAccent(0, true), true);
  assert.equal(isAccent(0, false), false);
  assert.equal(isAccent(1, true), false);
  assert.equal(isAccent(3, true), false);
});

test("clampVolume bounds to [0, 1]; junk -> 1", () => {
  assert.equal(clampVolume(0.5), 0.5);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume(2), 1);
  assert.equal(clampVolume(NaN), 1);
});

test("a full bar cycles through the expected beat indices", () => {
  const bpb = 4;
  const seq: number[] = [];
  let b = 0;
  for (let i = 0; i < 9; i++) {
    seq.push(b);
    b = nextBeatIndex(b, bpb);
  }
  assert.deepEqual(seq, [0, 1, 2, 3, 0, 1, 2, 3, 0]);
});
