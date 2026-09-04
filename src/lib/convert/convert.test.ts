// Pure-function tests for the converter engine. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, savingsPercent, resizeDims } from "./format.ts";
import { baseName, extensionOf, outputName } from "./filenames.ts";
import { accepts, acceptError } from "./mime.ts";
import { checkFileSize, checkMegapixels, checkImageCount } from "./limits.ts";
import { TOOLS, getTool, relatedTools, CATEGORY_ORDER } from "./registry.ts";

/* --------------------------------- format --------------------------------- */

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(2.4 * 1024 * 1024), "2.4 MB");
  assert.equal(formatBytes(-1), "—");
});

test("savingsPercent", () => {
  assert.equal(savingsPercent(1000, 340), 66);
  assert.equal(savingsPercent(1000, 1200), -20); // grew
  assert.equal(savingsPercent(0, 100), 0);
});

test("resizeDims keeps aspect ratio when locked", () => {
  assert.deepEqual(resizeDims(3000, 2000, 1200, null, true), { width: 1200, height: 800 });
  assert.deepEqual(resizeDims(3000, 2000, null, 800, true), { width: 1200, height: 800 });
  // unlocked uses both edges directly
  assert.deepEqual(resizeDims(3000, 2000, 1200, 1200, false), { width: 1200, height: 1200 });
  // never below 1
  assert.ok(resizeDims(3000, 2000, 1, null, true).height >= 1);
  assert.deepEqual(resizeDims(0, 0, 100, 100, true), { width: 0, height: 0 });
});

/* -------------------------------- filenames ------------------------------- */

test("filename helpers", () => {
  assert.equal(baseName("photo.png"), "photo");
  assert.equal(baseName("a/b/photo.final.png"), "photo.final");
  assert.equal(baseName("noext"), "noext");
  assert.equal(extensionOf("photo.PNG"), "png");
  assert.equal(extensionOf("noext"), "");
  assert.equal(outputName("photo.png", "jpg"), "photo.jpg");
  assert.equal(outputName("photo.jpg", "jpg", "-compressed"), "photo-compressed.jpg");
  assert.equal(outputName("document.pdf", "png", "-page-2"), "document-page-2.png");
  assert.equal(outputName("", "png"), "file.png");
});

/* ---------------------------------- mime ---------------------------------- */

test("accepts by MIME and by extension fallback", () => {
  const png = { accept: ["image/png"], acceptExts: ["png"] };
  assert.equal(accepts(png, { type: "image/png", name: "a.png" }), true);
  assert.equal(accepts(png, { type: "", name: "a.png" }), true); // blank MIME → ext
  assert.equal(accepts(png, { type: "image/jpeg", name: "a.jpg" }), false);
  const svg = { accept: ["image/svg+xml"], acceptExts: ["svg"] };
  assert.equal(accepts(svg, { type: "", name: "logo.svg" }), true); // SVG often blank MIME
  assert.equal(acceptError({ acceptLabel: "PNG" }), "This tool accepts PNG files.");
});

/* --------------------------------- limits --------------------------------- */

test("limit guards", () => {
  assert.equal(checkFileSize(1024), null);
  assert.ok(checkFileSize(0));
  assert.ok(checkFileSize(200 * 1024 * 1024));
  assert.equal(checkMegapixels(4000, 3000), null); // 12 MP ok
  assert.ok(checkMegapixels(20000, 20000)); // 400 MP rejected
  assert.equal(checkImageCount(3), null);
  assert.ok(checkImageCount(0));
  assert.ok(checkImageCount(500));
});

/* -------------------------------- registry -------------------------------- */

test("registry integrity", () => {
  assert.equal(TOOLS.length, 10);
  const slugs = new Set<string>();
  for (const t of TOOLS) {
    assert.ok(t.slug && !slugs.has(t.slug), `unique slug ${t.slug}`);
    slugs.add(t.slug);
    assert.ok(t.title && t.seoTitle && t.description, `${t.slug} has copy`);
    assert.ok(t.accept.length > 0 && t.acceptExts.length > 0, `${t.slug} accepts`);
    assert.ok(t.outputExt.length > 0, `${t.slug} outputExt`);
    assert.ok(CATEGORY_ORDER.includes(t.category), `${t.slug} known category`);
    // every related slug resolves to a real tool
    for (const r of t.related) assert.ok(getTool(r), `${t.slug} related ${r} exists`);
    // no tool relates to itself
    assert.ok(!t.related.includes(t.slug), `${t.slug} not self-related`);
  }
});

test("expected tool slugs all present", () => {
  const expected = [
    "png-to-jpg", "jpg-to-png", "webp-to-jpg", "webp-to-png", "svg-to-png",
    "image-compressor", "image-resizer",
    "jpg-to-pdf", "png-to-pdf",
    "png-to-ico",
  ];
  for (const s of expected) assert.ok(getTool(s), `has ${s}`);
});

test("Free Tools policy: every tool is free (no premium/plan gating in the registry)", () => {
  for (const t of TOOLS) {
    const rec = t as unknown as Record<string, unknown>;
    // Compression and resizing are Free acquisition utilities, never Pro.
    for (const k of ["premium", "pro", "plan", "paid", "requiresAuth", "limit", "credits"]) {
      assert.ok(!(k in rec), `${t.slug} must not carry a "${k}" flag`);
    }
  }
});

test("relatedTools returns real tool defs", () => {
  const t = getTool("png-to-jpg")!;
  const rel = relatedTools(t);
  assert.ok(rel.length > 0);
  assert.ok(rel.every((r) => typeof r.slug === "string"));
});
