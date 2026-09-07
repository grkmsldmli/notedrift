// Regression tests for the editor pointer/tool-state invariants that fix the
// iPad-Safari bugs. These lock the HARD guarantees the touch state machine relies
// on. (The full CanvasController can't be instantiated here — it needs a real
// Fabric canvas + DOM — so we test the pure guards it delegates to.)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tool } from "../types.ts";
import { DRAW_TOOLS } from "../brush/materials.ts";
import {
  isDrawingTool,
  canEraseWithTool,
  isViewportOnlyTool,
  shouldClaimAsPan,
  shouldFabricIgnorePointer,
} from "./pointerGuards.ts";

const ign = (o: Partial<Parameters<typeof shouldFabricIgnorePointer>[0]>) =>
  shouldFabricIgnorePointer({
    pointerType: "touch",
    tool: "hand",
    isOwned: false,
    gestureActive: false,
    domPanActive: false,
    ...o,
  });

const NON_DRAW: Tool[] = [
  "select",
  "hand",
  "eraser",
  "text",
  "note",
  "lasso",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "doublearrow",
];

/* ------------------------------ isDrawingTool ----------------------------- */

test("every DRAW_TOOLS entry is a drawing tool", () => {
  for (const t of DRAW_TOOLS) assert.equal(isDrawingTool(t), true, t);
});

test("Hand / Select / Eraser are never drawing tools", () => {
  for (const t of NON_DRAW) assert.equal(isDrawingTool(t), false, t);
  // The recovery invariant depends on this: isDrawingMode = isDrawingTool(tool),
  // so Hand can never be left in drawing mode.
  assert.equal(isDrawingTool("hand"), false);
});

/* ---------------------------- canEraseWithTool ---------------------------- */

test("erasing is reachable ONLY for the Eraser tool", () => {
  assert.equal(canEraseWithTool("eraser"), true);
  for (const t of [...DRAW_TOOLS, ...NON_DRAW].filter((t) => t !== "eraser")) {
    assert.equal(canEraseWithTool(t), false, t);
  }
  // The core BUG A guarantee: a stale erase after switching to Hand no-ops.
  assert.equal(canEraseWithTool("hand"), false);
});

/* --------------------------- isViewportOnlyTool --------------------------- */

test("only Hand is viewport-only", () => {
  assert.equal(isViewportOnlyTool("hand"), true);
  for (const t of [...DRAW_TOOLS, ...NON_DRAW].filter((t) => t !== "hand")) {
    assert.equal(isViewportOnlyTool(t), false, t);
  }
});

/* ----------------------------- shouldClaimAsPan --------------------------- */

test("Hand claims a single finger AND a stylus as a pan", () => {
  assert.equal(shouldClaimAsPan("hand", "touch", false), true);
  assert.equal(shouldClaimAsPan("hand", "pen", false), true);
  assert.equal(shouldClaimAsPan("hand", "touch", true), true); // penSeen irrelevant
});

test("Hand never routes a mouse pointer here (desktop mouse path owns it)", () => {
  assert.equal(shouldClaimAsPan("hand", "mouse", false), false);
});

test("a drawing tool claims a bare finger as a pan ONLY after a stylus was seen", () => {
  assert.equal(shouldClaimAsPan("pen", "touch", true), true); // palm rejection
  assert.equal(shouldClaimAsPan("pen", "touch", false), false); // finger draws
  assert.equal(shouldClaimAsPan("pen", "pen", true), false); // the stylus keeps drawing
});

test("Select / Eraser / Text single touch is NOT claimed (falls through to Fabric)", () => {
  for (const t of ["select", "eraser", "text"] as Tool[]) {
    assert.equal(shouldClaimAsPan(t, "touch", false), false, t);
    assert.equal(shouldClaimAsPan(t, "touch", true), false, `${t} +penSeen`);
  }
});

test("no tool ever claims a mouse pointer as a touch-pan", () => {
  for (const t of [...DRAW_TOOLS, ...NON_DRAW]) {
    assert.equal(shouldClaimAsPan(t, "mouse", false), false, t);
    assert.equal(shouldClaimAsPan(t, "mouse", true), false, `${t} +penSeen`);
  }
});

/* ------------------------- shouldFabricIgnorePointer ---------------------- */
// ONE POINTER = ONE OWNER: Fabric must hard-ignore DOM-owned touch/pen so a
// single iPad-Safari touch can't be processed twice (the isPanning=true smoking
// gun). Mouse always passes so desktop Hand keeps Fabric's isPanning path.

test("a DOM-owned touch/pen is always ignored by Fabric", () => {
  assert.equal(ign({ pointerType: "touch", isOwned: true, tool: "pen" }), true);
  assert.equal(ign({ pointerType: "pen", isOwned: true, tool: "select" }), true);
});

test("touch/pen while Hand is active is ignored even if unowned (defensive)", () => {
  assert.equal(ign({ pointerType: "touch", tool: "hand", isOwned: false }), true);
  assert.equal(ign({ pointerType: "pen", tool: "hand", isOwned: false }), true);
});

test("a live two-finger gesture makes Fabric ignore its touches (any tool)", () => {
  assert.equal(ign({ pointerType: "touch", tool: "select", gestureActive: true }), true);
  assert.equal(ign({ pointerType: "touch", tool: "pen", gestureActive: true }), true);
});

test("an unowned stylus/finger in a drawing/select tool still reaches Fabric", () => {
  // A legit pencil stroke must draw; a select touch must select.
  assert.equal(ign({ pointerType: "pen", tool: "pen", isOwned: false }), false);
  assert.equal(ign({ pointerType: "touch", tool: "pen", isOwned: false }), false);
  assert.equal(ign({ pointerType: "touch", tool: "select", isOwned: false }), false);
  assert.equal(ign({ pointerType: "touch", tool: "eraser", isOwned: false }), false);
});

test("a genuine mouse always passes — desktop Hand keeps Fabric's isPanning path", () => {
  assert.equal(ign({ pointerType: "mouse", tool: "hand" }), false);
  assert.equal(ign({ pointerType: "mouse", tool: "select" }), false);
});

test("a typeless (bare-MouseEvent) pointer is ignored ONLY while a DOM pan is live", () => {
  // Safari can synthesize a typeless event from a touch mid-pan.
  assert.equal(ign({ pointerType: undefined, domPanActive: true, tool: "hand" }), true);
  // No DOM pan → it is a genuine mouse → passes (desktop mouse Hand unaffected).
  assert.equal(ign({ pointerType: undefined, domPanActive: false, tool: "hand" }), false);
});
