// Custom Fabric objects: an arrow (line + head) and a sticky note.
//
// The sticky note is a `Textbox` SUBCLASS — not a group — so it stays natively
// editable (double-click to type) and round-trips through `toJSON()` /
// `loadFromJSON()` with its text, position, size and styling intact. It only
// overrides how its background is painted (a rounded, padded, shadowed card).

import * as fabric from "fabric";
import { CANVAS_FONT, COLORS, STROKE_WIDTH } from "./constants";

/* --------------------------------- arrow ---------------------------------- */

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

  return new fabric.Group([line, tip], { objectCaching: false });
}

/* ------------------------------ sticky note ------------------------------- */

const NOTE_PADDING = 14;
const NOTE_RADIUS = 14;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

type TextboxOptions = ConstructorParameters<typeof fabric.Textbox>[1];

export class StickyNote extends fabric.Textbox {
  static type = "StickyNote";

  constructor(text: string, options: TextboxOptions = {}) {
    super(text, {
      width: 200,
      padding: NOTE_PADDING,
      fontSize: 18,
      lineHeight: 1.3,
      fill: COLORS.noteInk,
      fontFamily: CANVAS_FONT,
      textAlign: "left",
      backgroundColor: "",
      ...options,
    });
  }

  // Paint the rounded, padded, shadowed card behind the text. Called by
  // Fabric's render pipeline before the text is drawn.
  _renderBackground(ctx: CanvasRenderingContext2D): void {
    const pad = this.padding ?? 0;
    const w = this.width + pad * 2;
    const h = this.height + pad * 2;
    const x = -w / 2;
    const y = -h / 2;

    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = COLORS.note;
    roundRectPath(ctx, x, y, w, h, NOTE_RADIUS);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = COLORS.noteBorder;
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, w, h, NOTE_RADIUS);
    ctx.stroke();
    ctx.restore();
  }
}

// Register so the class survives serialization (type: "StickyNote").
fabric.classRegistry.setClass(StickyNote);

/** Build a sticky note at (left, top), in scene coords. */
export function makeStickyNote(left: number, top: number): StickyNote {
  return new StickyNote("Note", { left, top });
}
