// The professional freehand stroke engine.
//
// Fabric's built-in PencilBrush decimates points and strokes a polyline, so
// circles and handwriting come out visibly polygonal. This brush instead:
//   1. Captures every pointer sample — including sub-frame points via
//      getCoalescedEvents() — with pressure, filtered by a small screen-space
//      minimum distance so we never hoard redundant points.
//   2. Feeds them through perfect-freehand (MIT) to build a smooth, optionally
//      pressure-tapered outline, with a tunable stabilization/streamline level.
//   3. Renders that outline live on the top canvas, then commits it as a normal
//      filled fabric.Path — fully serializable and identical to every other
//      object for selection, history, export, and autosave.
//
// The result is a *filled* Path (fill = ink color, no stroke). Legacy PencilBrush
// strokes are *stroked* Paths (stroke = color, no fill); both are fabric.Path and
// coexist without migration.

import * as fabric from "fabric";
import { getStroke } from "perfect-freehand";
import type { PenStabilization } from "../types";

/** Streamline (0–1) per stabilization level. Kept modest so even High stays
 *  responsive — no obvious "rope dragging" lag. */
const STREAMLINE: Record<PenStabilization, number> = {
  off: 0,
  low: 0.22,
  medium: 0.42,
  high: 0.58,
};

/** Minimum screen-space distance (px) between captured samples. */
const MIN_SAMPLE_DIST = 1.6;

export interface FreehandConfig {
  color: string;
  size: number;
  opacity: number;
  stabilization: PenStabilization;
  /** Pressure / dynamics width response toggle (where the brush supports it). */
  pressure: boolean;
  /** Brush character (from the active material). */
  smoothing: number;
  thinning: number;
  /** Velocity-based width dynamics (Brush) when no real stylus pressure. */
  dynamics: boolean;
  /** The active brush id, stored on the committed path. */
  brushId: string;
}

type Sample = [number, number, number]; // [sceneX, sceneY, pressure]

/** Build an SVG path `d` from a perfect-freehand outline using quadratic
 *  segments through the midpoints — smooth and compact. */
function svgPathFromOutline(points: number[][]): string {
  const n = points.length;
  if (n < 2) return "";
  const parts: (string | number)[] = ["M", points[0][0], points[0][1], "Q"];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    parts.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** Trace a perfect-freehand outline onto a 2D context (live preview). */
function traceOutline(ctx: CanvasRenderingContext2D, points: number[][]): void {
  const n = points.length;
  if (n < 2) return;
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
}

export class FreehandBrush extends fabric.BaseBrush {
  private inkColor = "#20242e";
  private size = 4;
  private inkOpacity = 1;
  private stabilization: PenStabilization = "low";
  private pressureEnabled = false;
  private matSmoothing = 0.55;
  private matThinning = 0.5;
  private matDynamics = false;
  private brushId = "pen";

  private samples: Sample[] = [];
  private lastClient: { x: number; y: number } | null = null;
  private drawing = false;
  private strokeSawPen = false;

  /** Diagnostics for the performance report (raw vs kept sample counts). */
  lastRawCount = 0;
  lastKeptCount = 0;
  lastOutlineCount = 0;

  configure(cfg: FreehandConfig): void {
    this.inkColor = cfg.color;
    this.size = cfg.size;
    this.inkOpacity = cfg.opacity;
    this.stabilization = cfg.stabilization;
    this.pressureEnabled = cfg.pressure;
    this.matSmoothing = cfg.smoothing;
    this.matThinning = cfg.thinning;
    this.matDynamics = cfg.dynamics;
    this.brushId = cfg.brushId;
  }

  /** Abandon an in-progress stroke (e.g. a gesture took over). */
  cancel(): void {
    this.drawing = false;
    this.samples = [];
    this.lastClient = null;
    const ctx = this.canvas.contextTop;
    if (ctx) this.canvas.clearContext(ctx);
  }

  onMouseDown(pointer: fabric.Point, ev: fabric.TBrushEventData): void {
    this.samples = [];
    this.lastClient = null;
    this.lastRawCount = 0;
    this.drawing = true;
    this.strokeSawPen = false;
    const e = ev.e as PointerEvent;
    if (e.pointerType === "pen") this.strokeSawPen = true;
    this.addSample(pointer.x, pointer.y, e.clientX, e.clientY, this.pressureOf(e));
    this.renderPreview();
  }

  onMouseMove(pointer: fabric.Point, ev: fabric.TBrushEventData): void {
    if (!this.drawing) return;
    const e = ev.e as PointerEvent;
    if (e.pointerType === "pen") this.strokeSawPen = true;
    const coalesced =
      typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
    if (coalesced && coalesced.length) {
      // Project each sub-frame event ourselves — canvas.getScenePoint() would
      // return the cached main-event pointer, collapsing all coalesced samples.
      for (const ce of coalesced) {
        const c = ce as PointerEvent;
        const s = this.sceneFromEvent(c);
        this.addSample(s.x, s.y, c.clientX, c.clientY, this.pressureOf(c));
      }
    } else {
      this.addSample(pointer.x, pointer.y, e.clientX, e.clientY, this.pressureOf(e));
    }
    this.renderPreview();
  }

  onMouseUp(): boolean {
    if (!this.drawing) return false;
    this.drawing = false;
    this.finalize();
    return false;
  }

  /** _render is required by BaseBrush; our live preview is renderPreview(). */
  _render(): void {
    this.renderPreview();
  }

  private pressureOf(e: PointerEvent): number {
    return this.pressureEnabled &&
      typeof e.pressure === "number" &&
      e.pressure > 0
      ? e.pressure
      : 0.5;
  }

  /** Scene coordinate of a raw pointer event, computed independently of Fabric's
   *  per-frame pointer cache (so coalesced samples keep their own positions). */
  private sceneFromEvent(e: PointerEvent): { x: number; y: number } {
    const el = this.canvas.upperCanvasEl;
    const rect = el.getBoundingClientRect();
    const lx = rect.width
      ? ((e.clientX - rect.left) / rect.width) * this.canvas.getWidth()
      : 0;
    const ly = rect.height
      ? ((e.clientY - rect.top) / rect.height) * this.canvas.getHeight()
      : 0;
    const inv = fabric.util.invertTransform(this.canvas.viewportTransform);
    const p = fabric.util.transformPoint(new fabric.Point(lx, ly), inv);
    return { x: p.x, y: p.y };
  }

  private addSample(
    sceneX: number,
    sceneY: number,
    clientX: number,
    clientY: number,
    pressure: number,
  ): void {
    this.lastRawCount++;
    if (this.lastClient) {
      const dx = clientX - this.lastClient.x;
      const dy = clientY - this.lastClient.y;
      if (dx * dx + dy * dy < MIN_SAMPLE_DIST * MIN_SAMPLE_DIST) return;
    }
    this.lastClient = { x: clientX, y: clientY };
    this.samples.push([sceneX, sceneY, pressure]);
  }

  private strokeOptions(committed: boolean) {
    // Width varies only when the tool's pressure/dynamics control is on AND the
    // material has a width response. Velocity dynamics (Brush) kick in only when
    // no real stylus pressure is present — and are honest brush dynamics, never
    // faked hardware pressure.
    let thinning = 0;
    let simulate = false;
    if (this.pressureEnabled && this.matThinning > 0) {
      thinning = this.matThinning;
      simulate = this.matDynamics && !this.strokeSawPen;
    }
    return {
      size: this.size,
      thinning,
      smoothing: this.matSmoothing,
      streamline: STREAMLINE[this.stabilization],
      simulatePressure: simulate,
      last: committed,
    };
  }

  private outline(committed: boolean): number[][] {
    if (!this.samples.length) return [];
    return getStroke(this.samples as number[][], this.strokeOptions(committed));
  }

  private renderPreview(): void {
    const ctx = this.canvas.contextTop;
    if (!ctx) return;
    this.canvas.clearContext(ctx);
    const out = this.outline(false);
    if (out.length < 2) return;
    const retina = this.canvas.getRetinaScaling();
    const v = this.canvas.viewportTransform;
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.beginPath();
    traceOutline(ctx, out);
    ctx.fillStyle = this.inkColor;
    ctx.globalAlpha = this.inkOpacity;
    ctx.fill();
    ctx.restore();
  }

  private finalize(): void {
    const ctx = this.canvas.contextTop;
    if (ctx) this.canvas.clearContext(ctx);

    this.lastKeptCount = this.samples.length;
    const out = this.outline(true);
    this.lastOutlineCount = out.length;
    this.samples = [];
    this.lastClient = null;
    if (out.length < 3) return;

    const d = svgPathFromOutline(out);
    if (!d) return;
    const path = new fabric.Path(d, {
      fill: this.inkColor,
      stroke: undefined,
      strokeWidth: 0,
      opacity: this.inkOpacity,
      objectCaching: true,
    });
    (path as fabric.Path & { ndBrush?: string }).ndBrush = this.brushId;
    this.canvas.add(path);
    this.canvas.requestRenderAll();
    // Mirror PencilBrush: let the controller record history / autosave once.
    this.canvas.fire("path:created", { path } as never);
  }
}
