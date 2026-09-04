import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_PDF_BYTES,
  MAX_RENDER_EDGE,
  checkPageCount,
  checkPdfFile,
  hasPdfHeader,
} from "./limits.ts";
import {
  clampZoom,
  fitPageScale,
  fitWidthScale,
  safeRenderScale,
} from "./geometry.ts";
import {
  clampPage,
  createSession,
  goToPage,
  nextPage,
  prevPage,
} from "./session.ts";

/* ---- limits: file validation ---- */

test("checkPdfFile accepts a normal pdf by type", () => {
  assert.equal(checkPdfFile({ size: 1000, type: "application/pdf", name: "a.pdf" }), null);
});

test("checkPdfFile accepts by extension when type is blank", () => {
  assert.equal(checkPdfFile({ size: 1000, type: "", name: "report.PDF" }), null);
});

test("checkPdfFile rejects empty, oversized, and non-pdf", () => {
  assert.match(checkPdfFile({ size: 0, type: "application/pdf", name: "a.pdf" })!, /empty/i);
  assert.match(
    checkPdfFile({ size: MAX_PDF_BYTES + 1, type: "application/pdf", name: "a.pdf" })!,
    /too large/i,
  );
  assert.match(checkPdfFile({ size: 10, type: "image/png", name: "a.png" })!, /pdf/i);
});

test("hasPdfHeader detects the %PDF- signature, tolerating leading bytes", () => {
  assert.equal(hasPdfHeader(new TextEncoder().encode("%PDF-1.7\n...")), true);
  assert.equal(hasPdfHeader(new TextEncoder().encode("   %PDF-1.4")), true);
  assert.equal(hasPdfHeader(new TextEncoder().encode("not a pdf at all")), false);
});

test("checkPageCount enforces bounds", () => {
  assert.equal(checkPageCount(1), null);
  assert.equal(checkPageCount(500), null);
  assert.match(checkPageCount(0)!, /no readable pages/i);
  assert.match(checkPageCount(501)!, /up to 500/i);
});

/* ---- geometry: zoom + fit + render-scale safety ---- */

test("clampZoom keeps values within [0.25, 4] and rejects junk", () => {
  assert.equal(clampZoom(1), 1);
  assert.equal(clampZoom(0.1), 0.25);
  assert.equal(clampZoom(10), 4);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampZoom(-3), 1);
});

test("fitPageScale fits the limiting dimension inside the viewport", () => {
  // 100x200 page in a 500x500 viewport, pad 0 → limited by height: 500/200 = 2.5
  assert.equal(fitPageScale(100, 200, 500, 500, 0), 2.5);
  // wide page limited by width
  assert.equal(fitPageScale(1000, 100, 500, 500, 0), 0.5);
});

test("fitWidthScale scales page width to the viewport width", () => {
  assert.equal(fitWidthScale(250, 500, 0), 2);
  assert.equal(fitWidthScale(2000, 500, 0), 0.25); // clamped to MIN_ZOOM
});

test("safeRenderScale caps the bitmap's longest edge", () => {
  // A 1000pt page at scale 3 and dpr 2 → 6000px longest edge, over the 4000 cap.
  const capped = safeRenderScale(1000, 500, 3, 2);
  assert.ok(capped < 3);
  assert.equal(Math.round(1000 * capped * 2), MAX_RENDER_EDGE);
  // Within budget → unchanged.
  assert.equal(safeRenderScale(600, 800, 1, 1), 1);
});

/* ---- session: page navigation ---- */

test("createSession starts on page 1 with fit-page", () => {
  const s = createSession({ filename: "a.pdf", byteLength: 10, numPages: 12 });
  assert.equal(s.page, 1);
  assert.equal(s.numPages, 12);
  assert.equal(s.fitMode, "page");
});

test("clampPage constrains into [1, numPages]", () => {
  assert.equal(clampPage(0, 10), 1);
  assert.equal(clampPage(99, 10), 10);
  assert.equal(clampPage(3.4, 10), 3);
  assert.equal(clampPage(Number.NaN, 10), 1);
});

test("next/prev/goTo respect bounds and preserve identity at the edges", () => {
  const s = createSession({ filename: "a.pdf", byteLength: 10, numPages: 3 });
  assert.equal(nextPage(s).page, 2);
  assert.equal(prevPage(s), s); // already on page 1 → same object
  const last = goToPage(s, 3);
  assert.equal(last.page, 3);
  assert.equal(nextPage(last), last); // already on last → same object
});
