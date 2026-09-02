// The relationship model: a Connector object plus a lightweight editable Node,
// and the anchor geometry both rely on.
//
// A Connector is a Fabric.Line whose endpoints are DERIVED from the objects it
// links (by stable id + edge anchor), not stored geometry. `syncGeometry()`
// recomputes x1..y2 from the live objects; the controller calls it whenever a
// linked object moves or after a load. Everything needed to rebuild a
// connection — source/target ids, anchors, free endpoints, style — is stored on
// the object and serialized via NOTEDRIFT_PROPS, so relationships survive
// save/reload/undo without relying on transient Fabric references.

import * as fabric from "fabric";
import {
  CANVAS_FONT,
  CONNECTOR_STROKE,
  CONNECTOR_WIDTH,
  NODE_FILL,
  NODE_H,
  NODE_INK,
  NODE_MIN_W,
  NODE_PAD,
  NODE_RADIUS,
  NODE_W,
} from "./constants";
import type { Anchor } from "./types";

export type Pt = { x: number; y: number };

/* --------------------------------- ids ------------------------------------ */

let __counter = 0;

/** Stable, collision-resistant object id. */
export function nid(): string {
  return (
    "nd_" +
    Date.now().toString(36) +
    (__counter++).toString(36) +
    Math.floor(Math.random() * 1e6).toString(36)
  );
}

/* ------------------------------- anchors ---------------------------------- */

export const ANCHORS: Anchor[] = ["top", "right", "bottom", "left"];

export const CONNECTABLE_TYPES = new Set([
  "rect",
  "ellipse",
  "stickynote",
  "nodebox",
  "textbox",
  "i-text",
  "itext",
  "text",
]);

export function isConnectable(o: fabric.FabricObject): boolean {
  if ((o as { ndRole?: string }).ndRole === "connector") return false;
  const t = ((o as { type?: string }).type ?? "").toLowerCase();
  return CONNECTABLE_TYPES.has(t);
}

export function sceneBoundsOf(o: fabric.FabricObject) {
  o.setCoords();
  const c = o.aCoords;
  const xs = [c.tl.x, c.tr.x, c.br.x, c.bl.x];
  const ys = [c.tl.y, c.tr.y, c.br.y, c.bl.y];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

export function anchorScenePoint(o: fabric.FabricObject, anchor: Anchor | null): Pt {
  const b = sceneBoundsOf(o);
  switch (anchor) {
    case "top":
      return { x: b.cx, y: b.top };
    case "right":
      return { x: b.right, y: b.cy };
    case "bottom":
      return { x: b.cx, y: b.bottom };
    case "left":
      return { x: b.left, y: b.cy };
    default:
      return { x: b.cx, y: b.cy };
  }
}

/** Nearest edge anchor of `o` to a scene point. */
export function nearestAnchor(o: fabric.FabricObject, p: Pt): Anchor {
  let best: Anchor = "top";
  let bestD = Infinity;
  for (const a of ANCHORS) {
    const ap = anchorScenePoint(o, a);
    const d = (ap.x - p.x) ** 2 + (ap.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

function roundRect(
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

/* ------------------------------- connector -------------------------------- */

type LineOptions = ConstructorParameters<typeof fabric.Line>[1];

export class Connector extends fabric.Line {
  static type = "Connector";

  declare ndId: string;
  declare ndRole: string;
  declare sourceId: string | null;
  declare targetId: string | null;
  declare sourceAnchor: Anchor | null;
  declare targetAnchor: Anchor | null;
  declare connKind: "arrow" | "straight";
  declare sourceFree: Pt | null;
  declare targetFree: Pt | null;

  constructor(points: number[] = [0, 0, 0, 0], options: Record<string, unknown> = {}) {
    super(points as [number, number, number, number], {
      stroke: (options.stroke as string) ?? CONNECTOR_STROKE,
      strokeWidth: (options.strokeWidth as number) ?? CONNECTOR_WIDTH,
      strokeLineCap: "round",
      strokeUniform: true,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      perPixelTargetFind: true,
      objectCaching: false,
      ...options,
    } as LineOptions);
    this.ndRole = "connector";
    this.ndId = (options.ndId as string) ?? nid();
    this.sourceId = (options.sourceId as string) ?? null;
    this.targetId = (options.targetId as string) ?? null;
    this.sourceAnchor = (options.sourceAnchor as Anchor) ?? null;
    this.targetAnchor = (options.targetAnchor as Anchor) ?? null;
    this.connKind = (options.connKind as "arrow" | "straight") ?? "arrow";
    this.sourceFree = (options.sourceFree as Pt) ?? null;
    this.targetFree = (options.targetFree as Pt) ?? null;
  }

  resolveEnd(
    objById: Map<string, fabric.FabricObject>,
    which: "source" | "target",
  ): Pt | null {
    const id = which === "source" ? this.sourceId : this.targetId;
    const anchor = which === "source" ? this.sourceAnchor : this.targetAnchor;
    if (id) {
      const o = objById.get(id);
      if (!o) return null;
      return anchorScenePoint(o, anchor);
    }
    const free = which === "source" ? this.sourceFree : this.targetFree;
    return free ? { x: free.x, y: free.y } : null;
  }

  /** Recompute endpoints from the linked objects. Returns false if unresolvable. */
  syncGeometry(objById: Map<string, fabric.FabricObject>): boolean {
    const p1 = this.resolveEnd(objById, "source");
    const p2 = this.resolveEnd(objById, "target");
    if (!p1 || !p2) return false;
    this.set({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    this.setCoords();
    return true;
  }

  _render(ctx: CanvasRenderingContext2D): void {
    super._render(ctx);
    if (this.connKind !== "arrow") return;
    const p = (
      this as unknown as {
        calcLinePoints: () => { x1: number; y1: number; x2: number; y2: number };
      }
    ).calcLinePoints();
    const angle = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
    const head = Math.max(9, (this.strokeWidth ?? CONNECTOR_WIDTH) * 3 + 3);
    ctx.save();
    ctx.fillStyle = (this.stroke as string) ?? CONNECTOR_STROKE;
    ctx.translate(p.x2, p.y2);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-head, -head * 0.55);
    ctx.lineTo(-head, head * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  static fromObject(object: Record<string, unknown>): Promise<Connector> {
    const pts = [object.x1, object.y1, object.x2, object.y2].map((v) =>
      typeof v === "number" ? v : 0,
    );
    return Promise.resolve(new Connector(pts, object));
  }
}

fabric.classRegistry.setClass(Connector);

/* --------------------------------- node ----------------------------------- */

type TextboxOptions = ConstructorParameters<typeof fabric.Textbox>[1];

/** A small, editable rounded node used by Quick Connect and the mind-map flow. */
export class NodeBox extends fabric.Textbox {
  static type = "NodeBox";

  declare ndId: string;

  constructor(text: string, options: Record<string, unknown> = {}) {
    super(text, {
      width: NODE_W - NODE_PAD * 2,
      minWidth: NODE_MIN_W - NODE_PAD * 2,
      fontSize: 16,
      textAlign: "center",
      fill: NODE_INK,
      fontFamily: CANVAS_FONT,
      backgroundColor: (options.backgroundColor as string) ?? NODE_FILL,
      ...options,
    } as TextboxOptions);
    this.ndId = (options.ndId as string) ?? nid();
  }

  initDimensions(): void {
    super.initDimensions();
    const minH = NODE_H - NODE_PAD * 2;
    if (this.height < minH) this.height = minH;
  }

  _getNonTransformedDimensions(): fabric.Point {
    const d = super._getNonTransformedDimensions();
    return new fabric.Point(d.x + NODE_PAD * 2, d.y + NODE_PAD * 2);
  }

  _renderBackground(ctx: CanvasRenderingContext2D): void {
    const w = this.width + NODE_PAD * 2;
    const h = this.height + NODE_PAD * 2;
    const x = -w / 2;
    const y = -h / 2;
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.10)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = (this.backgroundColor as string) || NODE_FILL;
    roundRect(ctx, x, y, w, h, NODE_RADIUS);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(91, 140, 255, 0.45)";
    ctx.lineWidth = 1.25;
    roundRect(ctx, x, y, w, h, NODE_RADIUS);
    ctx.stroke();
    ctx.restore();
  }
}

fabric.classRegistry.setClass(NodeBox);

/** Create a mind-map node at (left, top). */
export function makeNode(left: number, top: number, text = ""): NodeBox {
  return new NodeBox(text, { left, top });
}
