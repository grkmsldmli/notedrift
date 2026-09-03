// NdLine: a single robust vector line object for the whole line family
// (straight line / arrow / double arrow), replacing the fragile arrow Group.
//
// It is a fabric.Line subclass, so move / rotate / scale / dash come for free.
// Per-end arrowheads are drawn as part of the object (so they export and
// serialize), sized from the stroke width and kept ~screen-constant under
// scaling. Legacy arrow Groups still load and render via Fabric — this only adds
// a new object type; nothing is migrated.

import * as fabric from "fabric";
import { nid } from "../connectors";
import type { ArrowHead } from "../types";

type LineOptions = ConstructorParameters<typeof fabric.Line>[1];

export class NdLine extends fabric.Line {
  static type = "NdLine";

  declare ndId: string;
  declare startHead: ArrowHead;
  declare endHead: ArrowHead;

  constructor(points: number[] = [0, 0, 0, 0], options: Record<string, unknown> = {}) {
    // Strip the read-only `type` discriminator so enliven doesn't warn (see Connector).
    const rest = { ...options };
    delete rest.type;
    super(points as [number, number, number, number], {
      stroke: (options.stroke as string) ?? "#20242e",
      strokeWidth: (options.strokeWidth as number) ?? 4,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      strokeUniform: true,
      objectCaching: false,
      ...rest,
    } as LineOptions);
    this.ndId = (options.ndId as string) ?? nid();
    this.startHead = (options.startHead as ArrowHead) ?? "none";
    this.endHead = (options.endHead as ArrowHead) ?? "none";
  }

  private headSize(): number {
    const w = (this.strokeWidth as number) ?? 4;
    // Scales with stroke width but is clamped so it never becomes ridiculous.
    return Math.max(9, Math.min(w * 3.2 + 5, 46));
  }

  private drawHead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    style: ArrowHead,
    inv: number,
    size: number,
  ): void {
    if (style === "none") return;
    const stroke = (this.stroke as string) ?? "#20242e";
    const w = (this.strokeWidth as number) ?? 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(inv, inv); // keep the head ~screen-constant under object scale
    ctx.rotate(angle);
    ctx.setLineDash([]); // heads stay solid even on a dashed line
    ctx.lineWidth = w;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    if (style === "open") {
      ctx.beginPath();
      ctx.moveTo(-size, -size * 0.55);
      ctx.lineTo(0, 0);
      ctx.lineTo(-size, size * 0.55);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size * 0.5);
      ctx.lineTo(-size, size * 0.5);
      ctx.closePath();
      if (style === "filled") ctx.fill();
      else ctx.stroke();
    }
    ctx.restore();
  }

  _render(ctx: CanvasRenderingContext2D): void {
    super._render(ctx);
    if (this.startHead === "none" && this.endHead === "none") return;
    const p = (
      this as unknown as {
        calcLinePoints: () => { x1: number; y1: number; x2: number; y2: number };
      }
    ).calcLinePoints();
    const sx = (this.scaleX as number) || 1;
    const sy = (this.scaleY as number) || 1;
    // abs so a flip (negative scale in Fabric v7) can't NaN the head size.
    const inv = 1 / Math.sqrt(Math.max(1e-6, Math.abs(sx * sy)));
    const size = this.headSize();
    // Angles in the object's (scaled) frame so heads point along the drawn line.
    const endAngle = Math.atan2((p.y2 - p.y1) * sy, (p.x2 - p.x1) * sx);
    const startAngle = Math.atan2((p.y1 - p.y2) * sy, (p.x1 - p.x2) * sx);
    this.drawHead(ctx, p.x2, p.y2, endAngle, this.endHead, inv, size);
    this.drawHead(ctx, p.x1, p.y1, startAngle, this.startHead, inv, size);
  }

  static fromObject(object: Record<string, unknown>): Promise<NdLine> {
    const pts = [object.x1, object.y1, object.x2, object.y2].map((v) =>
      typeof v === "number" ? v : 0,
    );
    return Promise.resolve(new NdLine(pts, object));
  }
}

fabric.classRegistry.setClass(NdLine);

/** Create an NdLine from scene endpoints with the given style. */
export function makeNdLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    stroke: string;
    strokeWidth: number;
    startHead: ArrowHead;
    endHead: ArrowHead;
    dash?: number[] | null;
    opacity?: number;
  },
): NdLine {
  return new NdLine([x1, y1, x2, y2], {
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
    startHead: opts.startHead,
    endHead: opts.endHead,
    strokeDashArray: opts.dash ?? null,
    opacity: opts.opacity ?? 1,
  });
}
