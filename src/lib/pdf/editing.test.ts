import assert from "node:assert/strict";
import { test } from "node:test";

import {
  displayPointToView,
  displaySize,
  displayToPdf,
  invertMatrix,
  pdfToDisplay,
  viewPointToDisplay,
  viewportSize,
  viewportTransform,
  type PageGeometry,
} from "./coordinates.ts";
import {
  addOverlay,
  boxFromView,
  boxToView,
  createOverlayId,
  EMPTY_OVERLAY_STATE,
  normalizeBox,
  overlaysForPage,
  removeOverlay,
  replacePageOverlays,
  totalOverlayCount,
  updateOverlay,
  type PdfRectOverlay,
} from "./overlays.ts";
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  MAX_HISTORY,
  redo,
  undo,
} from "./history.ts";
import { makePageIds, pageIdAt, createSession } from "./session.ts";
import { applyStylePatch, controlsForTool, selectionOf } from "./toolState.ts";
import type { PdfTextOverlay } from "./overlays.ts";

const LETTER: PageGeometry = { width: 612, height: 792, rotation: 0 };

/* ------------------------------ coordinates ------------------------------ */

test("viewportTransform matches pdf.js for an unrotated letter page", () => {
  assert.deepEqual(viewportTransform(LETTER, 1), [1, 0, 0, -1, 0, 792]);
  assert.deepEqual(viewportTransform(LETTER, 2), [2, 0, 0, -2, 0, 1584]);
});

test("pdfToDisplay flips PDF's bottom-left origin to a top-left display origin", () => {
  assert.deepEqual(pdfToDisplay({ x: 0, y: 0 }, LETTER), { x: 0, y: 792 });
  assert.deepEqual(pdfToDisplay({ x: 0, y: 792 }, LETTER), { x: 0, y: 0 });
  assert.deepEqual(pdfToDisplay({ x: 612, y: 792 }, LETTER), { x: 612, y: 0 });
});

test("displayToPdf is the exact inverse of pdfToDisplay (all rotations)", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const page: PageGeometry = { width: 612, height: 792, rotation };
    for (const p of [{ x: 33, y: 71 }, { x: 400, y: 500 }, { x: 611, y: 1 }]) {
      const rt = displayToPdf(pdfToDisplay(p, page), page);
      assert.ok(Math.abs(rt.x - p.x) < 1e-9 && Math.abs(rt.y - p.y) < 1e-9, `rot ${rotation}`);
    }
  }
});

test("displaySize swaps dimensions for 90/270 rotation", () => {
  assert.deepEqual(displaySize(LETTER), { width: 612, height: 792 });
  assert.deepEqual(displaySize({ ...LETTER, rotation: 90 }), { width: 792, height: 612 });
  assert.deepEqual(displaySize({ ...LETTER, rotation: 270 }), { width: 792, height: 612 });
});

test("view space is exactly display space × scale (zoom linearity)", () => {
  const p = { x: 123, y: 456 };
  const disp = pdfToDisplay(p, LETTER);
  for (const s of [0.5, 1, 1.75, 3]) {
    const viaTransform = { x: 0, y: 0 };
    const m = viewportTransform(LETTER, s);
    viaTransform.x = m[0] * p.x + m[2] * p.y + m[4];
    viaTransform.y = m[1] * p.x + m[3] * p.y + m[5];
    const viaScale = displayPointToView(disp, s);
    assert.ok(Math.abs(viaScale.x - viaTransform.x) < 1e-9);
    assert.ok(Math.abs(viaScale.y - viaTransform.y) < 1e-9);
  }
});

test("a point stays put across repeated zoom cycles (invariance)", () => {
  const disp = { x: 200, y: 350 };
  for (const s of [0.25, 0.5, 1, 1.75, 3, 4]) {
    const back = viewPointToDisplay(displayPointToView(disp, s), s);
    assert.ok(Math.abs(back.x - disp.x) < 1e-9 && Math.abs(back.y - disp.y) < 1e-9);
  }
});

test("invertMatrix round-trips a transform", () => {
  const m = viewportTransform({ width: 500, height: 700, rotation: 90 }, 1.5);
  const inv = invertMatrix(m);
  const p = { x: 40, y: 90 };
  const fwd = { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
  const back = { x: inv[0] * fwd.x + inv[2] * fwd.y + inv[4], y: inv[1] * fwd.x + inv[3] * fwd.y + inv[5] };
  assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
});

test("viewportSize scales the display size", () => {
  assert.deepEqual(viewportSize(LETTER, 2), { width: 1224, height: 1584 });
});

/* -------------------------------- overlays ------------------------------- */

test("createOverlayId returns unique ids", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 2000; i++) ids.add(createOverlayId());
  assert.equal(ids.size, 2000);
});

function rect(id: string, pageId: string): PdfRectOverlay {
  return {
    id, pageId, type: "rect", opacity: 1,
    cx: 100, cy: 100, w: 50, h: 40, angle: 0,
    stroke: "#000", strokeWidth: 2, fill: null, radius: 0,
  };
}

test("overlay state ops are immutable and keep unchanged pages by identity", () => {
  const a = rect("a", "pg-1");
  const b = rect("b", "pg-2");
  let s = EMPTY_OVERLAY_STATE;
  s = addOverlay(s, a);
  s = addOverlay(s, b);
  assert.equal(totalOverlayCount(s), 2);
  const pg2 = s["pg-2"];

  // update on page 1 must not touch page 2's array identity
  const s2 = updateOverlay(s, { ...a, cx: 200 });
  assert.equal(s2["pg-2"], pg2, "unchanged page keeps identity");
  assert.equal((overlaysForPage(s2, "pg-1")[0] as PdfRectOverlay).cx, 200);
  assert.equal((overlaysForPage(s, "pg-1")[0] as PdfRectOverlay).cx, 100, "original untouched");

  const s3 = removeOverlay(s2, "pg-1", "a");
  assert.equal(overlaysForPage(s3, "pg-1").length, 0);
  assert.equal(totalOverlayCount(s3), 1);
});

test("replacePageOverlays swaps a whole page list", () => {
  let s = addOverlay(EMPTY_OVERLAY_STATE, rect("a", "pg-1"));
  s = replacePageOverlays(s, "pg-1", [rect("x", "pg-1"), rect("y", "pg-1")]);
  assert.equal(overlaysForPage(s, "pg-1").length, 2);
  assert.equal(overlaysForPage(s, "pg-1")[0].id, "x");
});

test("boxToView/boxFromView round-trip and scale linearly (zoom invariance)", () => {
  const box = { cx: 120.5, cy: 88.25, w: 60, h: 44 };
  for (const s of [0.25, 0.5, 1, 1.75, 3]) {
    const back = boxFromView(boxToView(box, s), s);
    assert.ok(Math.abs(back.cx - box.cx) < 1e-9);
    assert.ok(Math.abs(back.w - box.w) < 1e-9);
  }
  assert.deepEqual(boxToView({ cx: 10, cy: 20, w: 30, h: 40 }, 2), { cx: 20, cy: 40, w: 60, h: 80 });
});

test("normalizeBox makes extents positive", () => {
  assert.deepEqual(normalizeBox({ cx: 5, cy: 6, w: -30, h: -40 }), { cx: 5, cy: 6, w: 30, h: 40 });
});

/* -------------------------------- history -------------------------------- */

test("history commit/undo/redo walks the timeline", () => {
  const s0 = EMPTY_OVERLAY_STATE;
  const s1 = addOverlay(s0, rect("a", "pg-1"));
  const s2 = addOverlay(s1, rect("b", "pg-1"));

  let h = createHistory(s0);
  assert.equal(canUndo(h), false);
  h = commit(h, s1);
  h = commit(h, s2);
  assert.equal(h.present, s2);
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);

  h = undo(h);
  assert.equal(h.present, s1);
  h = undo(h);
  assert.equal(h.present, s0);
  assert.equal(canUndo(h), false);

  h = redo(h);
  assert.equal(h.present, s1);
  assert.equal(canRedo(h), true);
});

test("a fresh commit clears the redo stack", () => {
  let h = createHistory(EMPTY_OVERLAY_STATE);
  const s1 = addOverlay(EMPTY_OVERLAY_STATE, rect("a", "pg-1"));
  const s2 = addOverlay(EMPTY_OVERLAY_STATE, rect("b", "pg-1"));
  h = commit(h, s1);
  h = undo(h);
  h = commit(h, s2);
  assert.equal(canRedo(h), false);
  assert.equal(h.present, s2);
});

test("no-op commit (same reference) is ignored", () => {
  const s1 = addOverlay(EMPTY_OVERLAY_STATE, rect("a", "pg-1"));
  let h = createHistory(s1);
  h = commit(h, s1);
  assert.equal(canUndo(h), false);
});

test("history depth is bounded", () => {
  let h = createHistory(EMPTY_OVERLAY_STATE);
  for (let i = 0; i < MAX_HISTORY + 50; i++) {
    h = commit(h, addOverlay(EMPTY_OVERLAY_STATE, rect(`r${i}`, "pg-1")));
  }
  assert.equal(h.past.length, MAX_HISTORY);
});

/* -------------------------------- session -------------------------------- */

/* ------------------------------- tool state ------------------------------ */

function textOverlay(): PdfTextOverlay {
  return {
    id: "t1", pageId: "pg-1", type: "text", opacity: 1,
    x: 10, y: 20, width: 200, angle: 0, text: "hi",
    fontSize: 18, fontFamily: "sans", bold: false, italic: false, align: "left", color: "#111",
  };
}

test("selectionOf projects each overlay to its context controls", () => {
  const t = selectionOf(textOverlay());
  assert.equal(t.type, "text");
  assert.equal(t.fontFamily, "sans");
  assert.equal(t.fontSize, 18);
  const r = selectionOf(rect("r1", "pg-1"));
  assert.equal(r.color, "#000");
  assert.equal(r.strokeWidth, 2);
  assert.equal(r.fill, null);
});

test("applyStylePatch edits an overlay in its own vocabulary", () => {
  const t = applyStylePatch(textOverlay(), { color: "#f00", bold: true, fontSize: 32 }) as PdfTextOverlay;
  assert.equal(t.color, "#f00");
  assert.equal(t.bold, true);
  assert.equal(t.fontSize, 32);

  // a rect's "color" patch maps to its stroke; fill can be explicitly nulled
  const r = applyStylePatch(rect("r1", "pg-1"), { color: "#0f0", fill: "#eee" }) as PdfRectOverlay;
  assert.equal(r.stroke, "#0f0");
  assert.equal(r.fill, "#eee");
  const r2 = applyStylePatch(r, { fill: null }) as PdfRectOverlay;
  assert.equal(r2.fill, null);
});

test("controlsForTool exposes the right controls per tool", () => {
  assert.equal(controlsForTool("text").text, true);
  assert.equal(controlsForTool("pen").strokeWidth, true);
  assert.equal(controlsForTool("highlight").highlight, true);
  assert.equal(controlsForTool("rect").fill, true);
  assert.equal(controlsForTool("line").fill, false);
  assert.equal(controlsForTool("select").color, false);
});

test("page ids are stable and 1-based-indexed", () => {
  assert.deepEqual(makePageIds(3), ["pg-1", "pg-2", "pg-3"]);
  const s = createSession({ filename: "a.pdf", byteLength: 10, numPages: 5 });
  assert.equal(s.pageIds.length, 5);
  assert.equal(pageIdAt(s, 1), "pg-1");
  assert.equal(pageIdAt(s, 5), "pg-5");
  assert.equal(pageIdAt(s, 99), "pg-5", "clamps out-of-range");
});
