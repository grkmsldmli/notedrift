// PDF assembly tests (pdf-lib is pure JS — runs in node). Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildPdf } from "./pdf.ts";

// A minimal valid 1×1 PNG.
const PNG_1x1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

test("buildPdf emits a valid PDF (%PDF- header)", async () => {
  const bytes = await buildPdf([{ bytes: PNG_1x1, width: 120, height: 90 }]);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.byteLength > 100);
});

test("buildPdf preserves page order and count, sized to each image", async () => {
  const bytes = await buildPdf([
    { bytes: PNG_1x1, width: 100, height: 80 }, // landscape
    { bytes: PNG_1x1, width: 60, height: 120 }, // portrait
  ]);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  const [p0, p1] = doc.getPages();
  assert.equal(Math.round(p0.getWidth()), 100);
  assert.equal(Math.round(p0.getHeight()), 80);
  assert.equal(Math.round(p1.getWidth()), 60);
  assert.equal(Math.round(p1.getHeight()), 120);
});
