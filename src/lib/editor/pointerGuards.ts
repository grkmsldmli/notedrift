// Pure, dependency-free guards for the editor's pointer/tool state machine. They
// encode the HARD invariants that keep the Hand tool viewport-only and drawing
// recoverable, and are the single source of truth used by CanvasController's
// touch layer — so they can be unit-tested without a DOM/canvas (the controller
// itself needs a real Fabric canvas and can't be instantiated in the node test
// runner). See canvasController.ts (onDomPointerDown, eraseObject, applyToolMode,
// recoverInputState).

import type { Tool } from "../types.ts";
import { DRAW_TOOLS } from "../brush/materials.ts";

const DRAW_SET = new Set<Tool>(DRAW_TOOLS as Tool[]);

/** A freehand drawing tool (pen/pencil/marker/…). Drawing mode must always equal
 *  this for the current tool when no live multi-touch gesture is running. */
export function isDrawingTool(tool: Tool): boolean {
  return DRAW_SET.has(tool);
}

/** HARD invariant: object erasure is reachable ONLY while the Eraser tool is
 *  active. Any stale pointer completion under another tool must no-op. */
export function canEraseWithTool(tool: Tool): boolean {
  return tool === "eraser";
}

/** HARD invariant: the Hand tool is viewport navigation ONLY — never drawing,
 *  never mutation. */
export function isViewportOnlyTool(tool: Tool): boolean {
  return tool === "hand";
}

/** Whether a *single* pointer should be claimed as a dedicated, capture-owned
 *  viewport pan (intercepted before Fabric) for the given tool + input:
 *   - Hand: a finger OR a stylus pans (viewport-only contract).
 *   - A drawing tool after a stylus has been seen: a bare finger pans (palm
 *     rejection); the stylus itself keeps drawing.
 *   - Mouse never routes here (the desktop mouse path owns Hand-pan/space-pan).
 *  The two-finger pinch/pan gesture is decided separately, before this. */
export function shouldClaimAsPan(
  tool: Tool,
  pointerType: string,
  penSeen: boolean,
): boolean {
  if (pointerType === "mouse") return false;
  if (isViewportOnlyTool(tool)) return true;
  if (pointerType === "touch" && isDrawingTool(tool) && penSeen) return true;
  return false;
}

/** ONE POINTER = ONE OWNER. Whether Fabric's mouse lifecycle must HARD-IGNORE an
 *  event because the DOM navigation layer already owns that physical pointer.
 *  Real-device iPad Safari delivers a single touch to BOTH the DOM pointer layer
 *  and Fabric's synthesized-mouse path, so stopPropagation is not enough — Fabric
 *  itself must drop these. A touch/pen is dropped when: its id is DOM-owned (an
 *  active pointerPan), OR the Hand tool is active (viewport-only, defensive even
 *  if Safari mutates the id), OR a live two-finger gesture owns it. A bare mouse
 *  event (no pointerType) is dropped only while a DOM-owned touch/pen pan is live
 *  (Safari can synthesize a typeless event from a touch). A genuine desktop mouse
 *  always passes, so mouse Hand keeps Fabric's isPanning path. */
export function shouldFabricIgnorePointer(args: {
  pointerType: string | undefined;
  tool: Tool;
  isOwned: boolean;
  gestureActive: boolean;
  domPanActive: boolean;
}): boolean {
  const { pointerType, tool, isOwned, gestureActive, domPanActive } = args;
  if (pointerType === "touch" || pointerType === "pen") {
    return isOwned || isViewportOnlyTool(tool) || gestureActive;
  }
  if (pointerType === undefined) return domPanActive;
  return false; // genuine mouse → desktop path unchanged
}
