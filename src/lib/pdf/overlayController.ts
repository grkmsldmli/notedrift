// The interactive overlay engine for the PDF editor. A dedicated Fabric.js
// controller — NOT the main editor's CanvasController — that turns the
// authoritative, PDF-space overlay model (overlays.ts) into transient Fabric
// objects and back.
//
// Design invariants:
//   * The overlay MODEL (display-space geometry) is the source of truth. Fabric
//     objects are rebuilt from it on page load and read back on interaction end.
//   * Zoom is applied purely through Fabric's viewportTransform = [s,0,0,s,0,0].
//     Object coordinates stay in display space (scale-1 points), so zooming
//     never mutates stored geometry — the crux of zoom invariance.
//   * DPR is capped at 2 to match the background renderer's sharpness budget.
//   * The source PDF is a separate <canvas> below this one and is never part of
//     this Fabric scene — the page background can't be selected or moved.

import * as fabric from "fabric";
import { getStroke } from "perfect-freehand";
import {
  addOverlay,
  createOverlayId,
  EMPTY_OVERLAY_STATE,
  overlaysForPage,
  removeOverlay,
  totalOverlayCount,
  updateOverlay,
  type FontFamilyKey,
  type OverlayState,
  type PdfOverlay,
} from "./overlays.ts";
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo as histRedo,
  undo as histUndo,
  type History,
} from "./history.ts";
import {
  deletePage,
  duplicatePage,
  movePage,
  rotatePage,
  type DocState,
  type PageSlot,
} from "./document.ts";
import { reprojectionMatrix, type PageGeometry } from "./coordinates.ts";
import {
  applyStylePatch,
  DEFAULT_TOOL_STYLE,
  selectionOf,
  type PdfSelection,
  type PdfTool,
  type PdfToolStyle,
} from "./toolState.ts";

export { DEFAULT_TOOL_STYLE };
export type { PdfTool, PdfToolStyle, PdfSelection };
export type { PageSlot } from "./document.ts";

const HIGHLIGHT_OPACITY = 0.4;
const MAX_DPR = 2;
const MIN_DRAG = 4; // display pts; smaller drags are treated as clicks (ignored)

const EMPTY_DOC: DocState = { pages: [], overlays: EMPTY_OVERLAY_STATE };

export interface DocSummary {
  pages: readonly PageSlot[];
  canUndo: boolean;
  canRedo: boolean;
  overlayCount: number;
}

export interface ControllerCallbacks {
  onDoc?: (summary: DocSummary) => void;
  onSelection?: (selection: PdfSelection | null) => void;
  /** Fired after an action that should return the UI to the Select tool. */
  onToolReset?: () => void;
}

const FONT_STACK: Record<FontFamilyKey, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

const ACCENT = "#5b8cff";

type NdObject = fabric.Object & {
  ndId?: string;
  ndType?: PdfOverlay["type"];
  ndBaseMatrix?: number[];
};

function syncDpr(): void {
  if (typeof window !== "undefined") {
    fabric.config.devicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  }
}

/** perfect-freehand outline → compact SVG path `d`, in display coordinates. */
function outlinePath(points: readonly (readonly [number, number])[], width: number): string {
  if (points.length === 0) return "";
  const out = getStroke(points as unknown as number[][], {
    size: Math.max(1, width),
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: true,
  });
  if (out.length < 2) return "";
  const parts: (string | number)[] = ["M", out[0][0], out[0][1], "Q"];
  for (let i = 0; i < out.length; i++) {
    const [x0, y0] = out[i];
    const [x1, y1] = out[(i + 1) % out.length];
    parts.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** A fabric.Line that draws a filled arrowhead at its end point. */
class NdArrow extends fabric.Line {
  static type = "NdArrow";
  _render(ctx: CanvasRenderingContext2D): void {
    super._render(ctx);
    const p = (this as unknown as {
      calcLinePoints: () => { x1: number; y1: number; x2: number; y2: number };
    }).calcLinePoints();
    const sx = (this.scaleX as number) || 1;
    const sy = (this.scaleY as number) || 1;
    const inv = 1 / Math.sqrt(Math.max(1e-6, Math.abs(sx * sy)));
    const w = (this.strokeWidth as number) || 3;
    const size = Math.max(9, Math.min(w * 3.4 + 5, 42));
    const angle = Math.atan2((p.y2 - p.y1) * sy, (p.x2 - p.x1) * sx);
    ctx.save();
    ctx.translate(p.x2, p.y2);
    ctx.scale(inv, inv);
    ctx.rotate(angle);
    ctx.setLineDash([]);
    ctx.fillStyle = (this.stroke as string) ?? "#000";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.5);
    ctx.lineTo(-size, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export class PdfOverlayController {
  private canvas: fabric.Canvas;
  private cb: ControllerCallbacks;

  private doc: DocState = EMPTY_DOC;
  private history: History<DocState> = createHistory(EMPTY_DOC);

  private pageId: string | null = null;
  private displayW = 1;
  private displayH = 1;
  private scale = 1;

  private tool: PdfTool = "select";
  private style: PdfToolStyle = { ...DEFAULT_TOOL_STYLE };

  private disposed = false;
  private suppressSelection = false;

  // transient drawing state
  private penPoints: [number, number][] = [];
  private penning = false;
  private draft: fabric.Object | null = null;
  private dragStart: { x: number; y: number } | null = null;

  constructor(canvasEl: HTMLCanvasElement, callbacks: ControllerCallbacks = {}) {
    this.cb = callbacks;
    syncDpr();
    this.canvas = new fabric.Canvas(canvasEl, {
      selection: false, // single-object selection only (reliable; no group math)
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      allowTouchScrolling: true,
      fireRightClick: false,
      stopContextMenu: true,
      targetFindTolerance: 6,
      backgroundColor: undefined,
    });
    this.wireEvents();
  }

  /* ------------------------------ public API ---------------------------- */

  /** Initialize the document (page slots) when a PDF opens. Resets history. */
  init(pages: readonly PageSlot[], overlays: OverlayState = EMPTY_OVERLAY_STATE): void {
    this.doc = { pages: pages.slice(), overlays };
    this.history = createHistory(this.doc);
    if (this.pageId) this.reloadPage();
    this.emitDoc();
  }

  getOverlays(): OverlayState {
    return this.doc.overlays;
  }

  getPages(): readonly PageSlot[] {
    return this.doc.pages;
  }

  hasEdits(): boolean {
    // any overlays, or any page-structure change from the pristine 1:1 order
    if (totalOverlayCount(this.doc.overlays) > 0) return true;
    return this.doc.pages.some((p, i) => p.sourceIndex !== i || p.rotation !== 0)
      || this.doc.pages.length !== new Set(this.doc.pages.map((p) => p.sourceIndex)).size;
  }

  /* ---- page operations (undoable) ---- */

  rotateSlot(slotId: string, deltaDeg: number, oldGeom: PageGeometry, newGeom: PageGeometry): void {
    const m = reprojectionMatrix(oldGeom, newGeom);
    this.commitDoc(rotatePage(this.doc, slotId, deltaDeg, m));
    if (slotId === this.pageId) this.reloadPage();
  }

  removeSlot(slotId: string): void {
    this.commitDoc(deletePage(this.doc, slotId));
  }

  duplicateSlot(slotId: string): void {
    this.commitDoc(duplicatePage(this.doc, slotId));
  }

  reorderSlots(from: number, to: number): void {
    this.commitDoc(movePage(this.doc, from, to));
  }

  setPage(pageId: string, display: { width: number; height: number }, scale: number): void {
    this.flush();
    this.pageId = pageId;
    this.displayW = display.width;
    this.displayH = display.height;
    this.applyViewport(scale);
    this.reloadPage();
    this.applyToolMode();
  }

  setScale(scale: number): void {
    // Geometry is display-space; zoom is only a viewport transform. No rebuild.
    this.applyViewport(scale);
  }

  setDisplaySize(display: { width: number; height: number }): void {
    this.displayW = display.width;
    this.displayH = display.height;
    this.applyViewport(this.scale);
  }

  setTool(tool: PdfTool): void {
    this.cancelDrawing();
    this.tool = tool;
    this.applyToolMode();
  }

  getTool(): PdfTool {
    return this.tool;
  }

  setToolStyle(patch: Partial<PdfToolStyle>): void {
    this.style = { ...this.style, ...patch };
  }

  getToolStyle(): PdfToolStyle {
    return this.style;
  }

  /** Apply a style patch to the currently selected overlay. */
  updateSelected(patch: Partial<PdfSelection>): void {
    const active = this.canvas.getActiveObject() as NdObject | null;
    if (!active?.ndId || !this.pageId) return;
    const prev = overlaysForPage(this.doc.overlays, this.pageId).find((o) => o.id === active.ndId);
    if (!prev) return;
    const next = applyStylePatch(prev, patch);
    this.commitOverlays(updateOverlay(this.doc.overlays, next));
    this.reloadPage();
    this.selectById(next.id);
  }

  deleteSelected(): void {
    const active = this.canvas.getActiveObject() as NdObject | null;
    if (!active?.ndId || !this.pageId) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(active); // O(1) — no full page rebuild
    this.commitOverlays(removeOverlay(this.doc.overlays, this.pageId, active.ndId));
    this.canvas.requestRenderAll();
    this.emitSelection(null);
  }

  undo(): void {
    if (!canUndo(this.history)) return;
    this.history = histUndo(this.history);
    this.doc = this.history.present;
    this.reloadPage();
    this.emitDoc();
    this.emitSelection(null);
  }

  redo(): void {
    if (!canRedo(this.history)) return;
    this.history = histRedo(this.history);
    this.doc = this.history.present;
    this.reloadPage();
    this.emitDoc();
    this.emitSelection(null);
  }

  /** Commit any in-flight text edit / drawing back into the model. Call before
   *  switching pages or unmounting. */
  flush(): void {
    const active = this.canvas.getActiveObject();
    if (active && (active as fabric.IText).isEditing) {
      (active as fabric.IText).exitEditing();
    }
    this.cancelDrawing();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelDrawing();
    this.imageCache.clear();
    this.loadingImages.clear();
    try {
      void this.canvas.dispose();
    } catch {
      /* ignore */
    }
  }

  /* ---------------------------- viewport / load ------------------------- */

  private applyViewport(scale: number): void {
    this.scale = scale;
    syncDpr();
    const cw = Math.max(1, Math.round(this.displayW * scale));
    const ch = Math.max(1, Math.round(this.displayH * scale));
    this.canvas.setDimensions({ width: cw, height: ch });
    this.canvas.setViewportTransform([scale, 0, 0, scale, 0, 0] as fabric.TMat2D);
    this.canvas.requestRenderAll();
  }

  private reloadPage(): void {
    if (this.disposed || !this.pageId) return;
    this.suppressSelection = true;
    this.canvas.discardActiveObject();
    this.canvas.remove(...this.canvas.getObjects());
    for (const o of overlaysForPage(this.doc.overlays, this.pageId)) this.addOverlayObject(o);
    this.canvas.requestRenderAll();
    this.suppressSelection = false;
    this.applyToolMode();
  }

  /** Build + add a single overlay object (O(1)) without rebuilding the page —
   *  the hot path when drawing many overlays. */
  private addOverlayObject(o: PdfOverlay): fabric.Object | null {
    const obj = this.buildObject(o);
    if (!obj) return null;
    this.configureObject(obj, o);
    const select = this.tool === "select";
    obj.selectable = select;
    obj.evented = select;
    this.canvas.add(obj);
    // Freehand bakes transforms into its points on modify; capture the baseline
    // matrix so a later move/scale/rotate can be applied to the stored points.
    if (o.type === "freehand") {
      obj.setCoords();
      (obj as NdObject).ndBaseMatrix = obj.calcTransformMatrix();
    }
    return obj;
  }

  private applyToolMode(): void {
    const c = this.canvas;
    const select = this.tool === "select";
    c.forEachObject((o) => {
      o.selectable = select;
      o.evented = select;
    });
    c.skipTargetFind = !select;
    c.defaultCursor = select ? "default" : this.tool === "text" ? "text" : "crosshair";
    c.hoverCursor = select ? "move" : c.defaultCursor;
    if (!select) c.discardActiveObject();
    // Touch: allow one-finger pan (page scroll) in Select mode; capture the
    // gesture for drawing otherwise. Inline style beats the global editor CSS.
    const upper = c.upperCanvasEl as HTMLCanvasElement | undefined;
    if (upper) upper.style.touchAction = select ? "pan-x pan-y" : "none";
    c.requestRenderAll();
  }

  /* ------------------------------ build/read ---------------------------- */

  private buildObject(o: PdfOverlay): fabric.Object | null {
    switch (o.type) {
      case "text":
        return new fabric.Textbox(o.text.length ? o.text : " ", {
          left: o.x,
          top: o.y,
          width: Math.max(24, o.width),
          angle: o.angle,
          fontSize: o.fontSize,
          fontFamily: FONT_STACK[o.fontFamily],
          fontWeight: o.bold ? "bold" : "normal",
          fontStyle: o.italic ? "italic" : "normal",
          textAlign: o.align,
          fill: o.color,
          opacity: o.opacity,
          originX: "left",
          originY: "top",
          editable: true,
          objectCaching: false,
        });
      case "freehand": {
        const d = outlinePath(o.points, o.width);
        if (!d) return null;
        // No transform: the path is built from absolute display points, so it
        // renders exactly where it was drawn.
        return new fabric.Path(d, {
          fill: o.color,
          strokeWidth: 0,
          opacity: o.opacity,
          objectCaching: true,
        });
      }
      case "highlight": {
        const r = new fabric.Rect({
          left: o.cx,
          top: o.cy,
          originX: "center",
          originY: "center",
          width: o.w,
          height: o.h,
          fill: o.color,
          opacity: o.opacity,
          strokeWidth: 0,
          objectCaching: false,
        });
        (r as fabric.Object & { globalCompositeOperation?: string }).globalCompositeOperation =
          "multiply";
        return r;
      }
      case "rect":
        return new fabric.Rect({
          left: o.cx,
          top: o.cy,
          originX: "center",
          originY: "center",
          width: o.w,
          height: o.h,
          angle: o.angle,
          rx: o.radius,
          ry: o.radius,
          fill: o.fill ?? "transparent",
          stroke: o.stroke,
          strokeWidth: o.strokeWidth,
          strokeUniform: true,
          opacity: o.opacity,
          objectCaching: false,
        });
      case "ellipse":
        return new fabric.Ellipse({
          left: o.cx,
          top: o.cy,
          originX: "center",
          originY: "center",
          rx: o.w / 2,
          ry: o.h / 2,
          angle: o.angle,
          fill: o.fill ?? "transparent",
          stroke: o.stroke,
          strokeWidth: o.strokeWidth,
          strokeUniform: true,
          opacity: o.opacity,
          objectCaching: false,
        });
      case "line":
        return new fabric.Line([o.x1, o.y1, o.x2, o.y2], {
          stroke: o.stroke,
          strokeWidth: o.strokeWidth,
          strokeUniform: true,
          strokeLineCap: "round",
          opacity: o.opacity,
          objectCaching: false,
        });
      case "arrow":
        return new NdArrow([o.x1, o.y1, o.x2, o.y2], {
          stroke: o.stroke,
          strokeWidth: o.strokeWidth,
          strokeUniform: true,
          strokeLineCap: "round",
          strokeLineJoin: "round",
          opacity: o.opacity,
          objectCaching: false,
        });
      case "whiteout":
        return new fabric.Rect({
          left: o.cx,
          top: o.cy,
          originX: "center",
          originY: "center",
          width: o.w,
          height: o.h,
          angle: o.angle,
          fill: o.color,
          strokeWidth: 0,
          opacity: o.opacity,
          objectCaching: false,
        });
      case "image": {
        const el = this.imageCache.get(o.src);
        if (!el) {
          this.loadImage(o.src);
          return null; // rebuilt once the image element has loaded
        }
        const nw = el.naturalWidth || el.width || 1;
        const nh = el.naturalHeight || el.height || 1;
        const img = new fabric.FabricImage(el, {
          left: o.cx,
          top: o.cy,
          originX: "center",
          originY: "center",
          angle: o.angle,
          opacity: o.opacity,
          objectCaching: false,
        });
        img.scaleX = o.w / nw;
        img.scaleY = o.h / nh;
        return img;
      }
    }
  }

  private imageCache = new Map<string, HTMLImageElement>();
  private loadingImages = new Set<string>();

  private loadImage(src: string): void {
    if (this.loadingImages.has(src) || this.imageCache.has(src)) return;
    this.loadingImages.add(src);
    const el = new Image();
    el.onload = () => {
      this.loadingImages.delete(src);
      this.imageCache.set(src, el);
      if (!this.disposed) this.reloadPage();
    };
    el.onerror = () => this.loadingImages.delete(src);
    el.src = src;
  }

  private configureObject(obj: fabric.Object, o: PdfOverlay): void {
    (obj as NdObject).ndId = o.id;
    (obj as NdObject).ndType = o.type;
    obj.set({
      borderColor: ACCENT,
      cornerColor: "#ffffff",
      cornerStrokeColor: ACCENT,
      cornerStyle: "circle",
      transparentCorners: false,
      cornerSize: 10,
      borderScaleFactor: 1.5,
      padding: 4,
    });
    if (o.type === "highlight") {
      obj.setControlsVisibility({ mtr: false });
    } else if (o.type === "text") {
      obj.setControlsVisibility({
        tl: false,
        tr: false,
        bl: false,
        br: false,
        mt: false,
        mb: false,
        ml: true,
        mr: true,
        mtr: true,
      });
    } else if (o.type === "line" || o.type === "arrow") {
      obj.setControlsVisibility({ mt: false, mb: false });
    }
  }

  private readObject(obj: NdObject, prev: PdfOverlay): PdfOverlay {
    switch (prev.type) {
      case "text": {
        const t = obj as fabric.Textbox;
        return {
          ...prev,
          x: t.left ?? prev.x,
          y: t.top ?? prev.y,
          width: (t.width ?? prev.width) * (t.scaleX || 1),
          angle: t.angle ?? 0,
          fontSize: t.fontSize ?? prev.fontSize,
          text: t.text ?? prev.text,
        };
      }
      case "freehand":
        return prev; // handled by bakeFreehand
      case "highlight":
        return {
          ...prev,
          cx: obj.left ?? prev.cx,
          cy: obj.top ?? prev.cy,
          w: Math.abs((obj.width ?? prev.w) * (obj.scaleX || 1)),
          h: Math.abs((obj.height ?? prev.h) * (obj.scaleY || 1)),
        };
      case "rect":
        return {
          ...prev,
          cx: obj.left ?? prev.cx,
          cy: obj.top ?? prev.cy,
          w: Math.abs((obj.width ?? prev.w) * (obj.scaleX || 1)),
          h: Math.abs((obj.height ?? prev.h) * (obj.scaleY || 1)),
          angle: obj.angle ?? 0,
        };
      case "ellipse": {
        const el = obj as fabric.Ellipse;
        return {
          ...prev,
          cx: el.left ?? prev.cx,
          cy: el.top ?? prev.cy,
          w: Math.abs((el.rx ?? prev.w / 2) * 2 * (el.scaleX || 1)),
          h: Math.abs((el.ry ?? prev.h / 2) * 2 * (el.scaleY || 1)),
          angle: el.angle ?? 0,
        };
      }
      case "line":
      case "arrow": {
        const ln = obj as fabric.Line;
        const rel = (ln as unknown as {
          calcLinePoints: () => { x1: number; y1: number; x2: number; y2: number };
        }).calcLinePoints();
        const m = ln.calcTransformMatrix();
        const p1 = fabric.util.transformPoint(new fabric.Point(rel.x1, rel.y1), m);
        const p2 = fabric.util.transformPoint(new fabric.Point(rel.x2, rel.y2), m);
        return { ...prev, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }
      case "whiteout":
      case "image":
        return {
          ...prev,
          cx: obj.left ?? prev.cx,
          cy: obj.top ?? prev.cy,
          w: Math.abs((obj.width ?? prev.w) * (obj.scaleX || 1)),
          h: Math.abs((obj.height ?? prev.h) * (obj.scaleY || 1)),
          angle: obj.angle ?? 0,
        };
    }
  }

  /* -------------------------------- events ------------------------------ */

  private wireEvents(): void {
    const c = this.canvas;
    c.on("mouse:down", (opt) => this.onDown(opt));
    c.on("mouse:move", (opt) => this.onMove(opt));
    c.on("mouse:up", () => this.onUp());
    c.on("selection:created", () => this.onSelectionChanged());
    c.on("selection:updated", () => this.onSelectionChanged());
    c.on("selection:cleared", () => {
      if (!this.suppressSelection) this.emitSelection(null);
    });
    c.on("object:modified", (opt) => this.onObjectModified(opt.target as NdObject | undefined));
    c.on("text:changed", (opt) => this.onTextChanged(opt.target as NdObject | undefined));
    c.on("text:editing:exited", (opt) => this.onTextEditExit(opt.target as NdObject | undefined));
  }

  private scenePoint(e: fabric.TPointerEvent): { x: number; y: number } {
    const p = this.canvas.getScenePoint(e);
    return { x: p.x, y: p.y };
  }

  private onDown(opt: fabric.TPointerEventInfo): void {
    if (this.tool === "select") return;
    const p = this.scenePoint(opt.e);
    if (this.tool === "text") {
      this.placeText(p.x, p.y);
      return;
    }
    if (this.tool === "pen") {
      this.penning = true;
      this.penPoints = [[p.x, p.y]];
      this.renderPenPreview();
      return;
    }
    // shape / line / arrow drag
    this.dragStart = { x: p.x, y: p.y };
  }

  private onMove(opt: fabric.TPointerEventInfo): void {
    if (this.tool === "select") return;
    const p = this.scenePoint(opt.e);
    if (this.penning) {
      const last = this.penPoints[this.penPoints.length - 1];
      if (!last || Math.hypot(p.x - last[0], p.y - last[1]) >= 1) {
        this.penPoints.push([p.x, p.y]);
        this.renderPenPreview();
      }
      return;
    }
    if (this.dragStart) {
      if (this.draft) this.canvas.remove(this.draft);
      this.draft = this.buildDraft(this.dragStart.x, this.dragStart.y, p.x, p.y);
      if (this.draft) {
        this.draft.selectable = false;
        this.draft.evented = false;
        this.canvas.add(this.draft);
        this.canvas.requestRenderAll();
      }
    }
  }

  private onUp(): void {
    if (this.penning) {
      this.penning = false;
      this.finalizePen();
      return;
    }
    if (this.dragStart) {
      const start = this.dragStart;
      this.dragStart = null;
      if (this.draft) {
        this.canvas.remove(this.draft);
        this.draft = null;
      }
      // The final pointer is captured on the last move; recompute from draft geom
      // is unnecessary — finalize from the last known scene point instead.
      this.finalizeShapeFromPointer(start);
    }
  }

  private lastPointer: { x: number; y: number } | null = null;

  private onObjectModified(target: NdObject | undefined): void {
    if (!target?.ndId || !this.pageId) return;
    const prev = overlaysForPage(this.doc.overlays, this.pageId).find((o) => o.id === target.ndId);
    if (!prev) return;
    const next =
      prev.type === "freehand"
        ? this.bakeFreehand(target, prev)
        : this.readObject(target, prev);
    this.commitOverlays(updateOverlay(this.doc.overlays, next));
    // Freehand is rebuilt so its baseline matrix resets; keep it selected.
    if (prev.type === "freehand") {
      this.reloadPage();
      this.selectById(next.id);
    } else {
      this.emitSelectionFor(target);
    }
  }

  /** Bake a freehand object's move/scale/rotate delta into its stored points so
   *  the model always holds absolute display geometry (identity transform). */
  private bakeFreehand(obj: NdObject, prev: PdfOverlay): PdfOverlay {
    if (prev.type !== "freehand") return prev;
    const base = obj.ndBaseMatrix;
    const now = obj.calcTransformMatrix();
    if (!base) return prev;
    const delta = fabric.util.multiplyTransformMatrices(now, fabric.util.invertTransform(base as fabric.TMat2D));
    const points = prev.points.map((p) => {
      const q = fabric.util.transformPoint(new fabric.Point(p[0], p[1]), delta);
      return [q.x, q.y] as [number, number];
    });
    return { ...prev, points };
  }

  private onTextChanged(target: NdObject | undefined): void {
    // Live-resize behavior only; commit happens on editing exit.
    void target;
  }

  private onTextEditExit(target: NdObject | undefined): void {
    if (!target?.ndId || !this.pageId) return;
    const t = target as fabric.Textbox;
    const prev = overlaysForPage(this.doc.overlays, this.pageId).find((o) => o.id === target.ndId);
    if (!prev || prev.type !== "text") return;
    const text = (t.text ?? "").replace(/\s+$/g, "");
    if (!text.trim()) {
      // empty text box → discard it
      this.commitOverlays(removeOverlay(this.doc.overlays, this.pageId, prev.id));
      this.reloadPage();
      this.emitSelection(null);
      return;
    }
    const next = this.readObject(target, prev);
    this.commitOverlays(updateOverlay(this.doc.overlays, next));
  }

  private onSelectionChanged(): void {
    if (this.suppressSelection) return;
    const active = this.canvas.getActiveObject() as NdObject | null;
    if (active?.ndId) this.emitSelectionFor(active);
    else this.emitSelection(null);
  }

  /* ------------------------------ tool actions -------------------------- */

  private placeText(x: number, y: number): void {
    if (!this.pageId) return;
    const id = createOverlayId("tx");
    const overlay: PdfOverlay = {
      id,
      pageId: this.pageId,
      type: "text",
      opacity: 1,
      x,
      y,
      width: 220,
      angle: 0,
      text: "",
      fontSize: this.style.fontSize,
      fontFamily: this.style.fontFamily,
      bold: this.style.bold,
      italic: this.style.italic,
      align: this.style.align,
      color: this.style.strokeColor,
    };
    this.commitOverlays(addOverlay(this.doc.overlays, overlay));
    this.tool = "select";
    const obj = this.addOverlayObject(overlay) as fabric.Textbox | null;
    this.applyToolMode();
    this.cb.onToolReset?.();
    if (obj) {
      this.canvas.setActiveObject(obj);
      obj.enterEditing();
      this.canvas.requestRenderAll();
    }
  }

  /** Place an image (or signature image) centered on the current page. The
   *  caller passes the already-loaded element so it's cached and shown at once. */
  placeImage(el: HTMLImageElement, src: string, format: "png" | "jpg"): void {
    if (!this.pageId) return;
    this.imageCache.set(src, el);
    const nw = el.naturalWidth || el.width || 1;
    const nh = el.naturalHeight || el.height || 1;
    const ratio = Math.min((this.displayW * 0.5) / nw, (this.displayH * 0.5) / nh, 1);
    const w = Math.max(24, nw * ratio);
    const h = Math.max(24, nh * ratio);
    const overlay: PdfOverlay = {
      id: createOverlayId("img"),
      pageId: this.pageId,
      type: "image",
      opacity: 1,
      cx: this.displayW / 2,
      cy: this.displayH / 2,
      w,
      h,
      angle: 0,
      src,
      format,
    };
    this.commitOverlays(addOverlay(this.doc.overlays, overlay));
    this.tool = "select";
    const obj = this.addOverlayObject(overlay);
    this.applyToolMode();
    this.cb.onToolReset?.();
    if (obj) {
      this.canvas.setActiveObject(obj);
      this.canvas.requestRenderAll();
      this.emitSelectionFor(obj as NdObject);
    }
  }

  private buildDraft(x1: number, y1: number, x2: number, y2: number): fabric.Object | null {
    this.lastPointer = { x: x2, y: y2 };
    const s = this.style;
    if (this.tool === "line" || this.tool === "arrow") {
      const opts = {
        stroke: s.strokeColor,
        strokeWidth: s.strokeWidth,
        strokeUniform: true,
        strokeLineCap: "round" as const,
        opacity: s.opacity,
        objectCaching: false,
      };
      return this.tool === "arrow"
        ? new NdArrow([x1, y1, x2, y2], opts)
        : new fabric.Line([x1, y1, x2, y2], opts);
    }
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    if (this.tool === "highlight") {
      const r = new fabric.Rect({
        left: cx, top: cy, originX: "center", originY: "center",
        width: w, height: h, fill: s.highlightColor, opacity: HIGHLIGHT_OPACITY, strokeWidth: 0,
      });
      (r as fabric.Object & { globalCompositeOperation?: string }).globalCompositeOperation = "multiply";
      return r;
    }
    if (this.tool === "whiteout") {
      return new fabric.Rect({
        left: cx, top: cy, originX: "center", originY: "center",
        width: w, height: h, fill: s.whiteoutColor, strokeWidth: 0, opacity: 1,
      });
    }
    if (this.tool === "ellipse") {
      return new fabric.Ellipse({
        left: cx, top: cy, originX: "center", originY: "center",
        rx: w / 2, ry: h / 2, fill: s.fill ?? "transparent", stroke: s.strokeColor,
        strokeWidth: s.strokeWidth, strokeUniform: true, opacity: s.opacity,
      });
    }
    // rect
    return new fabric.Rect({
      left: cx, top: cy, originX: "center", originY: "center",
      width: w, height: h, fill: s.fill ?? "transparent", stroke: s.strokeColor,
      strokeWidth: s.strokeWidth, strokeUniform: true, opacity: s.opacity,
    });
  }

  private finalizeShapeFromPointer(start: { x: number; y: number }): void {
    const end = this.lastPointer ?? start;
    this.lastPointer = null;
    if (!this.pageId) return;
    const s = this.style;
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    if (Math.hypot(dx, dy) < MIN_DRAG) return; // treat as a stray click
    const id = createOverlayId(this.tool);
    let overlay: PdfOverlay;
    if (this.tool === "line" || this.tool === "arrow") {
      overlay = {
        id, pageId: this.pageId, type: this.tool, opacity: s.opacity,
        x1: start.x, y1: start.y, x2: end.x, y2: end.y,
        stroke: s.strokeColor, strokeWidth: s.strokeWidth,
      };
    } else {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const w = dx;
      const h = dy;
      if (this.tool === "highlight") {
        overlay = { id, pageId: this.pageId, type: "highlight", opacity: HIGHLIGHT_OPACITY, cx, cy, w, h, color: s.highlightColor };
      } else if (this.tool === "whiteout") {
        overlay = { id, pageId: this.pageId, type: "whiteout", opacity: 1, cx, cy, w, h, angle: 0, color: s.whiteoutColor };
      } else if (this.tool === "ellipse") {
        overlay = { id, pageId: this.pageId, type: "ellipse", opacity: s.opacity, cx, cy, w, h, angle: 0, stroke: s.strokeColor, strokeWidth: s.strokeWidth, fill: s.fill };
      } else {
        overlay = { id, pageId: this.pageId, type: "rect", opacity: s.opacity, cx, cy, w, h, angle: 0, radius: 0, stroke: s.strokeColor, strokeWidth: s.strokeWidth, fill: s.fill };
      }
    }
    this.commitOverlays(addOverlay(this.doc.overlays, overlay));
    this.addOverlayObject(overlay);
    this.canvas.requestRenderAll();
  }

  private renderPenPreview(): void {
    const ctx = this.canvas.contextTop;
    if (!ctx) return;
    this.canvas.clearContext(ctx);
    if (this.penPoints.length < 1) return;
    const out = getStroke(this.penPoints, {
      size: Math.max(1, this.style.strokeWidth),
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.4,
      simulatePressure: false,
      last: false,
    });
    if (out.length < 2) return;
    const retina = this.canvas.getRetinaScaling();
    const v = this.canvas.viewportTransform;
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.beginPath();
    ctx.moveTo(out[0][0], out[0][1]);
    for (let i = 0; i < out.length; i++) {
      const [x0, y0] = out[i];
      const [x1, y1] = out[(i + 1) % out.length];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.closePath();
    ctx.fillStyle = this.style.strokeColor;
    ctx.globalAlpha = this.style.opacity;
    ctx.fill();
    ctx.restore();
  }

  private finalizePen(): void {
    const ctx = this.canvas.contextTop;
    if (ctx) this.canvas.clearContext(ctx);
    const points = this.penPoints;
    this.penPoints = [];
    if (points.length < 2 || !this.pageId) return;
    const d = outlinePath(points, this.style.strokeWidth);
    if (!d) return;
    const overlay: PdfOverlay = {
      id: createOverlayId("pen"),
      pageId: this.pageId,
      type: "freehand",
      opacity: this.style.opacity,
      points,
      width: this.style.strokeWidth,
      color: this.style.strokeColor,
    };
    this.commitOverlays(addOverlay(this.doc.overlays, overlay));
    this.addOverlayObject(overlay);
    this.canvas.requestRenderAll();
  }

  private cancelDrawing(): void {
    this.penning = false;
    this.penPoints = [];
    this.dragStart = null;
    this.lastPointer = null;
    if (this.draft) {
      this.canvas.remove(this.draft);
      this.draft = null;
    }
    const ctx = this.canvas.contextTop;
    if (ctx) this.canvas.clearContext(ctx);
  }

  /* -------------------------------- helpers ----------------------------- */

  private findObject(id: string): fabric.Object | null {
    return this.canvas.getObjects().find((o) => (o as NdObject).ndId === id) ?? null;
  }

  private selectById(id: string): void {
    const obj = this.findObject(id);
    if (obj) {
      this.canvas.setActiveObject(obj);
      this.canvas.requestRenderAll();
      this.emitSelectionFor(obj as NdObject);
    }
  }

  private commitOverlays(overlays: OverlayState): void {
    this.commitDoc({ pages: this.doc.pages, overlays });
  }

  private commitDoc(next: DocState): void {
    if (next === this.doc) return;
    this.doc = next;
    this.history = commit(this.history, next);
    this.emitDoc();
  }

  private emitDoc(): void {
    this.cb.onDoc?.({
      pages: this.doc.pages,
      canUndo: canUndo(this.history),
      canRedo: canRedo(this.history),
      overlayCount: totalOverlayCount(this.doc.overlays),
    });
  }

  private emitSelectionFor(obj: NdObject): void {
    if (!obj.ndId || !this.pageId) {
      this.emitSelection(null);
      return;
    }
    const o = overlaysForPage(this.doc.overlays, this.pageId).find((x) => x.id === obj.ndId);
    this.emitSelection(o ? selectionOf(o) : null);
  }

  private emitSelection(sel: PdfSelection | null): void {
    this.cb.onSelection?.(sel);
  }
}
