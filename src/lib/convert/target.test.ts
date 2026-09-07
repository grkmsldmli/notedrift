// Compress-to-target-size decision logic. The canvas encoding lives in image.ts
// and runs on-device; every SIZING and SELECTION decision it makes is delegated
// to the pure functions here, so the target strategy is unit-tested directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultTargetKb,
  validateTargetKb,
  estimateDownscale,
  pickBestCandidate,
  type Candidate,
} from "./target.ts";
import {
  converterCtaLabel,
  qualityAppliesToMime,
  compressionOutcome,
  formatLabel,
  compressOutputFor,
} from "./format.ts";

const KB = 1024;

/* -------- 1. the chosen result is always AT OR BELOW the target -------- */

test("1. a reachable target picks a candidate at or below target", () => {
  const cands: Candidate[] = [
    { bytes: 260 * KB, width: 1000, height: 1000, quality: 0.9 }, // over
    { bytes: 180 * KB, width: 1000, height: 1000, quality: 0.7 }, // under
  ];
  const pick = pickBestCandidate(cands, 200 * KB);
  assert.ok(pick);
  assert.equal(pick!.reachedTarget, true);
  assert.ok(cands[pick!.index].bytes <= 200 * KB);
});

/* -------- 2. use the budget: 195 KB beats 120 KB for a 200 KB target ---- */

test("2. among valid candidates it prefers the one that best uses the budget", () => {
  // Same dimensions, different quality → higher quality (bigger, still under) wins.
  const cands: Candidate[] = [
    { bytes: 120 * KB, width: 1000, height: 1000, quality: 0.5 },
    { bytes: 195 * KB, width: 1000, height: 1000, quality: 0.8 },
  ];
  const pick = pickBestCandidate(cands, 200 * KB);
  assert.equal(pick!.reachedTarget, true);
  assert.equal(cands[pick!.index].bytes, 195 * KB); // NOT the much-smaller 120 KB
});

/* -------- 3. JPEG/WebP keep full resolution when quality alone can reach it -- */

test("3. full-resolution candidate is preferred over a downscaled one", () => {
  const cands: Candidate[] = [
    { bytes: 190 * KB, width: 1600, height: 533, quality: 0.6 }, // full res, fits
    { bytes: 150 * KB, width: 800, height: 266, quality: 0.9 }, // downscaled, fits
  ];
  const pick = pickBestCandidate(cands, 200 * KB);
  assert.equal(cands[pick!.index].width, 1600); // highest resolution wins
});

/* -------- 4. dimensions are reduced only when quality alone can't fit ---- */

test("4. when no full-res candidate fits, a downscaled one is chosen", () => {
  const cands: Candidate[] = [
    { bytes: 300 * KB, width: 1600, height: 533, quality: 0.1 }, // full res, still over
    { bytes: 40 * KB, width: 640, height: 213, quality: 0.7 }, // downscaled, fits
  ];
  const pick = pickBestCandidate(cands, 50 * KB);
  assert.equal(pick!.reachedTarget, true);
  assert.equal(cands[pick!.index].width, 640);
});

test("4b. estimateDownscale ≈ sqrt(size ratio), clamped to (0,1]", () => {
  assert.equal(estimateDownscale(50_000, 200_000), 0.5); // sqrt(0.25)
  assert.equal(estimateDownscale(200_000, 200_000), 1); // already fits → no shrink
  assert.equal(estimateDownscale(500_000, 200_000), 1); // never upscale past 1
  assert.equal(estimateDownscale(10, 0), 1); // guard against divide-by-zero
});

/* -------- 5. WebP behaves like JPEG (quality candidates, format preserved) -- */

test("5. WebP input stays WebP and uses quality candidates", () => {
  const webp = new File([new Uint8Array(4)], "photo.webp", { type: "image/webp" });
  assert.deepEqual(compressOutputFor(webp), { output: "webp", ext: "webp" });
  assert.equal(qualityAppliesToMime("image/webp"), true);
});

/* -------- 6. PNG has NO quality control -------- */

test("6. PNG never exposes a functional quality control", () => {
  assert.equal(qualityAppliesToMime("image/png"), false);
});

/* -------- 7. PNG reduces DIMENSIONS and stays PNG (never silently converted) -- */

test("7. PNG input stays PNG; selection is by dimensions, not quality", () => {
  const png = new File([new Uint8Array(4)], "logo.png", { type: "image/png" });
  assert.deepEqual(compressOutputFor(png), { output: "png", ext: "png" });
  // PNG candidates carry no quality; larger dimensions that fit win.
  const cands: Candidate[] = [
    { bytes: 900 * KB, width: 1600, height: 533 }, // over
    { bytes: 180 * KB, width: 1015, height: 338 }, // under, bigger
    { bytes: 60 * KB, width: 640, height: 213 }, // under, smaller
  ];
  const pick = pickBestCandidate(cands, 200 * KB);
  assert.equal(cands[pick!.index].width, 1015); // largest dims ≤ target
});

/* -------- 8. transparency-carrying inputs are never flattened to JPEG ---- */

test("8. PNG/WebP inputs keep an alpha-capable encoder (never JPEG)", () => {
  for (const [name, type] of [
    ["a.png", "image/png"],
    ["b.webp", "image/webp"],
  ] as const) {
    const f = new File([new Uint8Array(4)], name, { type });
    assert.notEqual(compressOutputFor(f).output, "jpeg"); // would drop transparency
  }
});

/* -------- 9. target ≥ original → "already under", no re-encode -------- */

test("9. a target at or above the original is reported as already under", () => {
  const original = 617 * KB;
  assert.equal(validateTargetKb(700, original).alreadyUnder, true);
  assert.equal(validateTargetKb(617, original).alreadyUnder, true); // exactly equal
  assert.equal(validateTargetKb(300, original).alreadyUnder, false);
});

/* -------- 10. unreachable target → honest closest, reachedTarget=false ---- */

test("10. when nothing fits, the closest (smallest) result is returned honestly", () => {
  const cands: Candidate[] = [
    { bytes: 40 * KB, width: 320, height: 107, quality: 0.1 },
    { bytes: 55 * KB, width: 480, height: 160, quality: 0.1 },
  ];
  const pick = pickBestCandidate(cands, 10 * KB); // impossibly small
  assert.equal(pick!.reachedTarget, false);
  assert.equal(cands[pick!.index].bytes, 40 * KB); // the closest (smallest) one
});

/* -------- 11. filename / mime / displayed format always agree -------- */

test("11. displayed format matches the produced file's mime and extension", () => {
  for (const [mime, ext, label] of [
    ["image/png", "png", "PNG"],
    ["image/jpeg", "jpg", "JPG"],
    ["image/webp", "webp", "WebP"],
  ] as const) {
    assert.equal(formatLabel(mime, `photo-compressed.${ext}`), label);
    assert.equal(formatLabel(mime), label);
  }
});

/* -------- 12. saved bytes / percent are computed correctly -------- */

test("12. saved bytes and percent reflect the real reduction", () => {
  const o = compressionOutcome(617 * KB, 196 * KB);
  assert.equal(o.improved, true);
  assert.equal(o.savedBytes, (617 - 196) * KB);
  assert.equal(o.percent, Math.round(((617 - 196) / 617) * 100)); // 68
});

/* -------- 13. no fake / negative savings -------- */

test("13. an equal or larger result is never a saving", () => {
  assert.equal(compressionOutcome(200 * KB, 200 * KB).improved, false);
  assert.equal(compressionOutcome(200 * KB, 210 * KB).improved, false);
  assert.ok(compressionOutcome(200 * KB, 210 * KB).savedBytes < 0);
});

/* -------- 14. target validation (positive integer, min 10 KB) -------- */

test("14. target must be a positive integer of at least 10 KB", () => {
  const orig = 617 * KB;
  assert.equal(validateTargetKb(9, orig).valid, false);
  assert.equal(validateTargetKb(0, orig).valid, false);
  assert.equal(validateTargetKb(-50, orig).valid, false);
  assert.equal(validateTargetKb(50.5, orig).valid, false);
  assert.equal(validateTargetKb(Number.NaN, orig).valid, false);
  assert.equal(validateTargetKb(100, orig).valid, true);
});

/* -------- 15. primary CTA reads "Compress Image" -------- */

test("15. the compress CTA is 'Compress Image', not 'Convert to …'", () => {
  assert.equal(converterCtaLabel("compress", false), "Compress Image");
  assert.notEqual(converterCtaLabel("compress", false), "Convert to JPG");
});

/* -------- 16. a sensible default target (~half, tidy step) -------- */

test("16. default target is ~half the original, floored to a 10 KB step", () => {
  assert.equal(defaultTargetKb(617 * KB), 300); // 617 → ~300
  assert.equal(defaultTargetKb(1000 * KB), 500);
  assert.ok(defaultTargetKb(4 * KB) >= 10); // never below the 10 KB floor
});
