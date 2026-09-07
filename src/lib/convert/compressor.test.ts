// Image-compressor correctness: truthful format display, honest no-improvement
// handling, PNG-ignores-quality, and correct savings. Pure logic — the browser
// engine (canvas encoding) is exercised on-device, not here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatLabel,
  qualityAppliesToMime,
  compressionOutcome,
  converterCtaLabel,
  toolOutputLabel,
} from "./format.ts";

/* ---- format display comes from the ACTUAL produced file, never tool metadata --- */

test("1. PNG result displays PNG, never JPG", () => {
  assert.equal(formatLabel("image/png", "photo-compressed.png"), "PNG");
  assert.equal(formatLabel("image/png"), "PNG");
  assert.notEqual(formatLabel("image/png", "photo-compressed.png"), "JPG");
});

test("2. JPEG result displays JPG", () => {
  assert.equal(formatLabel("image/jpeg", "photo-compressed.jpg"), "JPG");
  assert.equal(formatLabel("image/jpeg"), "JPG");
});

test("3. WebP result displays WebP", () => {
  assert.equal(formatLabel("image/webp", "photo-compressed.webp"), "WebP");
  assert.equal(formatLabel("image/webp"), "WebP");
});

test("9. filename / mime / display always agree", () => {
  for (const [mime, ext, label] of [
    ["image/png", "png", "PNG"],
    ["image/jpeg", "jpg", "JPG"],
    ["image/webp", "webp", "WebP"],
  ] as const) {
    // derived from the MIME…
    assert.equal(formatLabel(mime), label);
    // …and derived from the filename extension → the SAME label.
    assert.equal(formatLabel("application/octet-stream", `photo-compressed.${ext}`), label);
  }
  // A PNG file can never be labelled JPG (the reported registry bug).
  assert.equal(formatLabel("image/png", "something-compressed.png"), "PNG");
});

/* ---- action label ---- */

test("4. compressor CTA says 'Compress Image', not 'Convert to …'", () => {
  assert.equal(converterCtaLabel("compress", false, "jpg"), "Compress Image");
  assert.equal(converterCtaLabel("compress", true), "Compressing…");
  assert.equal(converterCtaLabel("resize", false), "Resize Image");
  assert.equal(converterCtaLabel("raster", false, "png"), "Convert to PNG");
});

/* ---- PNG ignores quality ---- */

test("5. quality applies to JPEG/WebP but NOT PNG", () => {
  assert.equal(qualityAppliesToMime("image/jpeg"), true);
  assert.equal(qualityAppliesToMime("image/webp"), true);
  assert.equal(qualityAppliesToMime("image/png"), false);
  assert.equal(qualityAppliesToMime("image/gif"), false);
});

/* ---- honest outcome ---- */

test("6. equal bytes is NOT a successful compression (no '0% smaller' success)", () => {
  const o = compressionOutcome(617_000, 617_000);
  assert.equal(o.improved, false);
  assert.equal(o.percent, 0);
});

test("7. a larger output is NOT a successful compression", () => {
  const o = compressionOutcome(617_000, 640_000);
  assert.equal(o.improved, false);
  assert.ok(o.savedBytes < 0);
});

test("8. real savings are computed correctly", () => {
  const o = compressionOutcome(617_000, 312_000);
  assert.equal(o.improved, true);
  assert.equal(o.savedBytes, 305_000);
  assert.equal(o.percent, 49); // round((617-312)/617*100) = 49
});

/* ---- truthful listing/page badge ---- */

test("format-preserving tools describe the action, not a fake target format", () => {
  assert.equal(toolOutputLabel("compress", undefined), "Compressed");
  assert.equal(toolOutputLabel("resize", undefined), "Resized");
  assert.equal(toolOutputLabel("raster", "png"), "PNG");
});
