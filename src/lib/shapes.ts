// Factory helpers for the two composite objects Fabric has no primitive for:
// an arrow (line + arrowhead) and a sticky note (card + editable text).
//
// Both are built as plain Fabric Groups so they serialize/deserialize with the
// standard `toJSON()` / `loadFromJSON()` round-trip — no custom class registry
// needed.

import * as fabric from "fabric";
import { CANVAS_FONT, COLORS, STROKE_WIDTH } from "./constants";

/** Build an arrow group pointing from (x1,y1) to (x2,y2), in scene coords. */
export function makeArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string = COLORS.ink,
  width: number = STROKE_WIDTH,
): fabric.Group {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(11, width * 4);

  // Pull the line back slightly so it tucks under the arrowhead tip.
  const backX = x2 - Math.cos(angle) * head * 0.5;
  const backY = y2 - Math.sin(angle) * head * 0.5;

  const line = new fabric.Line([x1, y1, backX, backY], {
    stroke,
    strokeWidth: width,
    strokeLineCap: "round",
  });

  const tip = new fabric.Triangle({
    left: x2,
    top: y2,
    originX: "center",
    originY: "center",
    width: head,
    height: head,
    fill: stroke,
    angle: (angle * 180) / Math.PI + 90,
  });

  return new fabric.Group([line, tip], {
    objectCaching: false,
  });
}

/** Build a sticky note (yellow card + editable text) at (left, top). */
export function makeStickyNote(left: number, top: number): fabric.Group {
  const W = 200;
  const H = 150;

  const card = new fabric.Rect({
    left,
    top,
    width: W,
    height: H,
    rx: 16,
    ry: 16,
    fill: COLORS.note,
    stroke: COLORS.noteBorder,
    strokeWidth: 1,
    shadow: new fabric.Shadow({
      color: "rgba(15, 23, 42, 0.18)",
      blur: 18,
      offsetX: 0,
      offsetY: 8,
    }),
  });

  const text = new fabric.Textbox("Note", {
    left: left + 16,
    top: top + 16,
    width: W - 32,
    fontSize: 18,
    lineHeight: 1.25,
    fill: COLORS.noteInk,
    fontFamily: CANVAS_FONT,
  });

  // `interactive` + `subTargetCheck` let the user double-click the note to edit
  // its text in place during the session.
  return new fabric.Group([card, text], {
    interactive: true,
    subTargetCheck: true,
  });
}
