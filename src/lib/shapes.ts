// Custom Fabric objects: an arrow (line + head) and a sticky note.
//
// StickyNote is a `Textbox` subclass whose *card* (a fixed-size rounded panel)
// is bigger than the text box by NOTE_PAD on every side. We override
// `_getNonTransformedDimensions` so the whole card is the selectable/hit area,
// and `initDimensions` to enforce a minimum card height. It stays natively
// editable and round-trips through JSON (including its `noteFill` color).

import * as fabric from "fabric";
import {
  CANVAS_FONT,
  COLORS,
  NOTE_COLORS,
  NOTE_H,
  NOTE_MIN_W,
  NOTE_PAD,
  NOTE_RADIUS,
  NOTE_W,
  STROKE_WIDTHS,
} from "./constants";

/* --------------------------------- arrow ---------------------------------- */

/** Build an arrow group pointing from (x1,y1) to (x2,y2), in scene coords. */
export function makeArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string = COLORS.ink,
  width: number = STROKE_WIDTHS.medium,
): fabric.Group {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(11, width * 3 + 5);

  const backX = x2 - Math.cos(angle) * head * 0.5;
  const backY = y2 - Math.sin(angle) * head * 0.5;

  const line = new fabric.Line([x1, y1, backX, backY], {
    stroke,
    strokeWidth: width,
    strokeLineCap: "round",
    strokeUniform: true,
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
    strokeUniform: true,
  });

  return new fabric.Group([line, tip], { objectCaching: false });
}

/** Restyle an existing arrow group (stroke color + width) in place. */
export function styleArrow(
  group: fabric.Group,
  patch: { stroke?: string; strokeWidth?: number },
): void {
  const [line, tip] = group.getObjects();
  if (line && patch.stroke !== undefined) (line as fabric.Line).set({ stroke: patch.stroke });
  if (line && patch.strokeWidth !== undefined)
    (line as fabric.Line).set({ strokeWidth: patch.strokeWidth });
  if (tip && patch.stroke !== undefined) (tip as fabric.Triangle).set({ fill: patch.stroke });
  group.set("dirty", true);
}

/* ------------------------------ sticky note ------------------------------- */

type TextboxOptions = ConstructorParameters<typeof fabric.Textbox>[1];

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

// The card color is stored in the standard, already-serialized
// `backgroundColor` property, so it round-trips through JSON for free.
export class StickyNote extends fabric.Textbox {
  static type = "StickyNote";

  constructor(text: string, options: (TextboxOptions & { noteFill?: string }) = {}) {
    const noteFill = (options as { noteFill?: string }).noteFill;
    super(text, {
      width: NOTE_W - NOTE_PAD * 2,
      minWidth: NOTE_MIN_W - NOTE_PAD * 2,
      fontSize: 18,
      lineHeight: 1.3,
      fill: COLORS.noteInk,
      fontFamily: CANVAS_FONT,
      textAlign: "left",
      backgroundColor: noteFill ?? NOTE_COLORS[0].value,
      ...options,
    });
  }

  // Enforce a minimum card height (text box height = card - 2*pad).
  initDimensions(): void {
    super.initDimensions();
    const minTextHeight = NOTE_H - NOTE_PAD * 2;
    if (this.height < minTextHeight) this.height = minTextHeight;
  }

  // Make the whole card (text box + padding on all sides) the hit/selection
  // area, so clicking anywhere on the note selects it.
  _getNonTransformedDimensions(): fabric.Point {
    const dim = super._getNonTransformedDimensions();
    return new fabric.Point(dim.x + NOTE_PAD * 2, dim.y + NOTE_PAD * 2);
  }

  // Paint the rounded, padded, shadowed card (using backgroundColor) behind text.
  _renderBackground(ctx: CanvasRenderingContext2D): void {
    const w = this.width + NOTE_PAD * 2;
    const h = this.height + NOTE_PAD * 2;
    const x = -w / 2;
    const y = -h / 2;

    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = (this.backgroundColor as string) || NOTE_COLORS[0].value;
    roundRectPath(ctx, x, y, w, h, NOTE_RADIUS);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(15, 23, 42, 0.10)";
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, w, h, NOTE_RADIUS);
    ctx.stroke();
    ctx.restore();
  }
}

fabric.classRegistry.setClass(StickyNote);

/** Build a sticky note at (left, top), in scene coords. */
export function makeStickyNote(
  left: number,
  top: number,
  noteFill: string = NOTE_COLORS[0].value,
): StickyNote {
  return new StickyNote("", { left, top, noteFill });
}
