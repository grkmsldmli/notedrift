import assert from "node:assert/strict";
import { test } from "node:test";

import { reprojectionMatrix, type Matrix, type PageGeometry } from "./coordinates.ts";
import {
  deletePage,
  duplicatePage,
  initialPages,
  movePage,
  reprojectOverlay,
  rotatePage,
  type DocState,
} from "./document.ts";
import {
  addOverlay,
  overlaysForPage,
  totalOverlayCount,
  EMPTY_OVERLAY_STATE,
  type PdfRectOverlay,
  type PdfFreehandOverlay,
} from "./overlays.ts";

const LETTER: PageGeometry = { width: 612, height: 792, rotation: 0 };
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function rect(id: string, pageId: string, cx = 100, cy = 100): PdfRectOverlay {
  return { id, pageId, type: "rect", opacity: 1, cx, cy, w: 50, h: 40, angle: 0, stroke: "#000", strokeWidth: 2, fill: null, radius: 0 };
}

function baseDoc(): DocState {
  let overlays = EMPTY_OVERLAY_STATE;
  overlays = addOverlay(overlays, rect("r1", "pg-1"));
  overlays = addOverlay(overlays, rect("r2", "pg-2"));
  return { pages: initialPages(3), overlays };
}

test("initialPages builds 1:1 slots", () => {
  const p = initialPages(3);
  assert.deepEqual(p.map((s) => s.id), ["pg-1", "pg-2", "pg-3"]);
  assert.deepEqual(p.map((s) => s.sourceIndex), [0, 1, 2]);
  assert.equal(p[0].rotation, 0);
});

test("rotatePage updates rotation and re-projects that page's overlays only", () => {
  const doc = baseDoc();
  const m = reprojectionMatrix(LETTER, { ...LETTER, rotation: 90 });
  const next = rotatePage(doc, "pg-1", 90, m);
  assert.equal(next.pages[0].rotation, 90);
  assert.equal(next.pages[1].rotation, 0);
  // pg-1's rect center moved; pg-2 untouched (identity)
  const r1 = overlaysForPage(next.overlays, "pg-1")[0] as PdfRectOverlay;
  const orig = overlaysForPage(doc.overlays, "pg-1")[0] as PdfRectOverlay;
  assert.ok(r1.cx !== orig.cx || r1.cy !== orig.cy, "reprojected");
  assert.equal(r1.angle, 90);
  assert.equal((overlaysForPage(next.overlays, "pg-2")[0] as PdfRectOverlay).cx, orig.cx);
});

test("rotate is reversible via the inverse reprojection", () => {
  const doc = baseDoc();
  const fwd = reprojectionMatrix(LETTER, { ...LETTER, rotation: 90 });
  const back = reprojectionMatrix({ ...LETTER, rotation: 90 }, LETTER);
  const rotated = rotatePage(doc, "pg-1", 90, fwd);
  const restored = rotatePage(rotated, "pg-1", -90, back);
  const r = overlaysForPage(restored.overlays, "pg-1")[0] as PdfRectOverlay;
  const orig = overlaysForPage(doc.overlays, "pg-1")[0] as PdfRectOverlay;
  assert.ok(Math.abs(r.cx - orig.cx) < 1e-6 && Math.abs(r.cy - orig.cy) < 1e-6);
  assert.equal(restored.pages[0].rotation, 0);
});

test("deletePage removes the slot + its overlays, never the last page", () => {
  const doc = baseDoc();
  const next = deletePage(doc, "pg-1");
  assert.equal(next.pages.length, 2);
  assert.equal(overlaysForPage(next.overlays, "pg-1").length, 0);
  assert.equal(next.pages[0].id, "pg-2");
  // can't delete down to zero
  let one: DocState = { pages: initialPages(1), overlays: EMPTY_OVERLAY_STATE };
  one = deletePage(one, "pg-1");
  assert.equal(one.pages.length, 1);
});

test("duplicatePage inserts a copy after with fresh ids and copied overlays", () => {
  const doc = baseDoc();
  const next = duplicatePage(doc, "pg-1");
  assert.equal(next.pages.length, 4);
  const dupId = next.pages[1].id;
  assert.notEqual(dupId, "pg-1");
  assert.equal(next.pages[1].sourceIndex, 0); // same source page
  const copied = overlaysForPage(next.overlays, dupId);
  assert.equal(copied.length, 1);
  assert.notEqual(copied[0].id, "r1"); // fresh overlay id
  assert.equal(copied[0].pageId, dupId);
  // original untouched
  assert.equal(overlaysForPage(next.overlays, "pg-1")[0].id, "r1");
  assert.equal(totalOverlayCount(next.overlays), 3);
});

test("movePage reorders slots without touching overlays", () => {
  const doc = baseDoc();
  const next = movePage(doc, 0, 2); // pg-1 to the end
  assert.deepEqual(next.pages.map((p) => p.id), ["pg-2", "pg-3", "pg-1"]);
  assert.equal(next.overlays, doc.overlays); // same reference
  assert.equal(movePage(doc, 0, 0), doc); // no-op
});

test("reprojectOverlay swaps a highlight's w/h on a 90° rotation", () => {
  const m = reprojectionMatrix(LETTER, { ...LETTER, rotation: 90 });
  const hl = { id: "h", pageId: "pg-1", type: "highlight" as const, opacity: 0.4, cx: 100, cy: 100, w: 200, h: 20, color: "#ff0" };
  const r = reprojectOverlay(hl, m, 90) as typeof hl;
  assert.equal(r.w, 20);
  assert.equal(r.h, 200);
  // 180° keeps w/h
  const r180 = reprojectOverlay(hl, reprojectionMatrix(LETTER, { ...LETTER, rotation: 180 }), 180) as typeof hl;
  assert.equal(r180.w, 200);
  assert.equal(r180.h, 20);
});

test("reprojectOverlay with identity is a no-op except angle delta", () => {
  const r = reprojectOverlay(rect("r", "pg-1", 10, 20), IDENTITY, 0) as PdfRectOverlay;
  assert.deepEqual({ cx: r.cx, cy: r.cy, angle: r.angle }, { cx: 10, cy: 20, angle: 0 });
  const fh: PdfFreehandOverlay = { id: "f", pageId: "pg-1", type: "freehand", opacity: 1, points: [[1, 2], [3, 4]], width: 3, color: "#000" };
  const fr = reprojectOverlay(fh, IDENTITY, 0) as PdfFreehandOverlay;
  assert.deepEqual(fr.points, [[1, 2], [3, 4]]);
});
