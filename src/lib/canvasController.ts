// CanvasController: the imperative core of the NoteDrift editor.
//
// It owns the Fabric canvas and all interaction logic (tools, drawing, styling,
// zoom/pan, history, autosave, export, alignment guides). React never touches
// Fabric directly — it creates one controller, subscribes to state via
// `onState`, and calls public methods.

import * as fabric from "fabric";
import {
  CANVAS_FONT,
  GRID_COLOR,
  GRID_LINE_COLOR,
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
} from "./constants";
import { History } from "./history";
import { makeArrow, makeStickyNote, styleArrow } from "./shapes";
import type {
  CanvasDoc,
  CanvasStyle,
  EditorState,
  ObjKind,
  SelectionInfo,
  StylePatch,
  ToolDefaults,
  Tool,
} from "./types";

export interface ControllerCallbacks {
  onState: (state: EditorState) => void;
  /** Called (debounced) with the latest canvas document to persist. */
  onPersist: (doc: CanvasDoc) => void;
}

type PointerInfo = fabric.TPointerEventInfo<fabric.TPointerEvent>;
type WheelInfo = fabric.TPointerEventInfo<WheelEvent>;

interface Guide {
  axis: "v" | "h";
  pos: number; // scene coordinate
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const PERSIST_IDLE = 500;
const PERSIST_MAXWAIT = 4000;
const SNAP_SCREEN_PX = 6;

/** Categorize a Fabric object for the contextual toolbar. */
function kindOf(obj: fabric.FabricObject): ObjKind {
  // Fabric v7 exposes lowercased instance types (e.g. "stickynote", "i-text").
  const t = ((obj as { type?: string }).type ?? "").toLowerCase();
  if (t === "stickynote") return "note";
  if (t === "i-text" || t === "itext" || t === "textbox" || t === "text")
    return "text";
  if (t === "path") return "path";
  if (t === "image") return "image";
  return "shape";
}

export class CanvasController {
  readonly canvas: fabric.Canvas;
  private readonly paperEl: HTMLElement;
  private readonly cb: ControllerCallbacks;
  private readonly history = new History();

  private tool: Tool = "select";
  private canvasStyle: CanvasStyle;
  private defaults: ToolDefaults;

  // Interaction state
  private suppress = false;
  private disposed = false;
  private drawing = false;
  private draft: fabric.FabricObject | null = null;
  private start = { x: 0, y: 0 };
  private cur = { x: 0, y: 0 };
  private isPanning = false;
  private isErasing = false;
  private interacting = false; // moving/scaling/rotating an object
  private spaceDown = false;
  private lastPan = { x: 0, y: 0 };
  private clipboard: fabric.FabricObject | null = null;
  private activeGuides: Guide[] = [];

  // Autosave bookkeeping
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistPending = false;
  private lastPersistAt = 0;

  private emitScheduled = false;
  private loadQueue: Promise<void> = Promise.resolve();

  constructor(
    el: HTMLCanvasElement,
    paperEl: HTMLElement,
    cb: ControllerCallbacks,
    style: CanvasStyle,
    defaults: ToolDefaults,
  ) {
    this.paperEl = paperEl;
    this.cb = cb;
    this.canvasStyle = style;
    this.defaults = defaults;

    this.canvas = new fabric.Canvas(el, {
      preserveObjectStacking: true,
      selection: true,
      fireRightClick: false,
      stopContextMenu: true,
      enableRetinaScaling: true,
      backgroundColor: undefined,
    });

    this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    this.canvas.freeDrawingBrush.color = defaults.penColor;
    this.canvas.freeDrawingBrush.width = defaults.penWidth;

    this.resize();
    this.setCanvasStyle(style);
    this.wireEvents();
    this.applyToolMode();
    this.history.reset(this.snapshot());
    this.emit();
  }

  /* ------------------------------ lifecycle ------------------------------- */

  resize(): void {
    const w = this.paperEl.clientWidth;
    const h = this.paperEl.clientHeight;
    if (w > 0 && h > 0) {
      this.canvas.setDimensions({ width: w, height: h });
      this.updateGrid();
      this.emit();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    void this.canvas.dispose();
  }

  /* -------------------------------- state --------------------------------- */

  private snapshot(): string {
    return JSON.stringify(this.canvas.toJSON());
  }

  private screenRectOf(obj: fabric.FabricObject): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    obj.setCoords();
    const c = obj.aCoords;
    const vpt = this.canvas.viewportTransform;
    const xs = [c.tl.x, c.tr.x, c.br.x, c.bl.x].map((x) => x * vpt[0] + vpt[4]);
    const ys = [c.tl.y, c.tr.y, c.br.y, c.bl.y].map((y) => y * vpt[3] + vpt[5]);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  private styleOf(obj: fabric.FabricObject, kind: ObjKind): Partial<SelectionInfo> {
    if (kind === "note") {
      const n = obj as fabric.Textbox;
      return {
        noteFill: n.backgroundColor as string,
        fontSize: n.fontSize,
        textColor: n.fill as string,
        textAlign: n.textAlign,
      };
    }
    if (kind === "text") {
      const t = obj as fabric.Textbox;
      return {
        textColor: t.fill as string,
        fontSize: t.fontSize,
        bold: t.fontWeight === "bold",
        textAlign: t.textAlign,
      };
    }
    if (kind === "shape") {
      if (obj instanceof fabric.Group) {
        const line = obj.getObjects()[0];
        return {
          stroke: (line?.stroke as string) ?? undefined,
          strokeWidth: line?.strokeWidth,
          fill: "transparent",
        };
      }
      return {
        stroke: obj.stroke as string,
        strokeWidth: obj.strokeWidth,
        fill: (obj.fill as string) ?? "transparent",
      };
    }
    if (kind === "path") {
      return { stroke: obj.stroke as string, strokeWidth: obj.strokeWidth };
    }
    return {};
  }

  private buildSelection(): SelectionInfo {
    const active = this.canvas.getActiveObject();
    if (!active) return { kind: "none", count: 0, rect: null };

    const objs = this.canvas.getActiveObjects();
    // Hide the contextual toolbar while actively transforming.
    const rect = this.interacting ? null : this.screenRectOf(active);

    if (objs.length > 1) {
      const kinds = new Set(objs.map(kindOf));
      if (kinds.size === 1) {
        const k = [...kinds][0];
        return { kind: k, count: objs.length, rect, ...this.styleOf(objs[0], k) };
      }
      return { kind: "mixed", count: objs.length, rect };
    }

    const k = kindOf(active);
    return { kind: k, count: 1, rect, ...this.styleOf(active, k) };
  }

  private getState(): EditorState {
    return {
      tool: this.tool,
      zoom: this.canvas.getZoom(),
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      canvasStyle: this.canvasStyle,
      hasSelection: this.canvas.getActiveObjects().length > 0,
      selection: this.buildSelection(),
    };
  }

  private emit(): void {
    if (this.emitScheduled || this.disposed) return;
    this.emitScheduled = true;
    const run = () => {
      this.emitScheduled = false;
      if (!this.disposed) this.cb.onState(this.getState());
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else run();
  }

  private recordHistory(): void {
    if (this.suppress) return;
    this.history.record(this.snapshot());
    this.emit();
  }

  private schedulePersist(): void {
    if (this.suppress) return;
    this.persistPending = true;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    const sinceLast = Date.now() - this.lastPersistAt;
    const delay = Math.max(0, Math.min(PERSIST_IDLE, PERSIST_MAXWAIT - sinceLast));
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (this.persistPending) this.flush();
    }, delay);
  }

  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.disposed) return;
    this.persistPending = false;
    this.lastPersistAt = Date.now();
    this.cb.onPersist(this.canvas.toJSON());
  }

  /* ------------------------------ tool defaults --------------------------- */

  setDefaults(patch: Partial<ToolDefaults>): void {
    this.defaults = { ...this.defaults, ...patch };
    if (this.tool === "pen" && this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.color = this.defaults.penColor;
      this.canvas.freeDrawingBrush.width = this.defaults.penWidth;
    }
  }

  /* -------------------------------- tools --------------------------------- */

  setTool(tool: Tool): void {
    this.tool = tool;
    this.applyToolMode();
    this.emit();
  }

  getTool(): Tool {
    return this.tool;
  }

  isEditing(): boolean {
    const active = this.canvas.getActiveObject() as
      | (fabric.FabricObject & { isEditing?: boolean })
      | undefined;
    return Boolean(active?.isEditing);
  }

  exitEditing(): void {
    const active = this.canvas.getActiveObject() as
      | (fabric.FabricObject & { isEditing?: boolean; exitEditing?: () => void })
      | undefined;
    if (active?.isEditing && active.exitEditing) {
      active.exitEditing();
      this.canvas.requestRenderAll();
    }
  }

  isSpaceDown(): boolean {
    return this.spaceDown;
  }

  setSpace(down: boolean): void {
    this.spaceDown = down;
    this.canvas.defaultCursor = down ? "grab" : this.baseCursor();
    this.canvas.setCursor(this.canvas.defaultCursor);
  }

  private baseCursor(): string {
    switch (this.tool) {
      case "select":
        return "default";
      case "text":
        return "text";
      case "eraser":
        return "cell";
      default:
        return "crosshair";
    }
  }

  private applyToolMode(): void {
    const c = this.canvas;
    c.isDrawingMode = this.tool === "pen";

    if (this.tool === "pen" && c.freeDrawingBrush) {
      c.freeDrawingBrush.color = this.defaults.penColor;
      c.freeDrawingBrush.width = this.defaults.penWidth;
    }

    c.selection = this.tool === "select";
    c.skipTargetFind = !(this.tool === "select" || this.tool === "eraser");
    c.defaultCursor = this.baseCursor();
    c.hoverCursor = this.tool === "select" ? "move" : this.baseCursor();

    const selectable = this.tool === "select";
    const evented = this.tool === "select" || this.tool === "eraser";
    c.forEachObject((o) => {
      o.selectable = selectable;
      o.evented = evented;
    });

    if (this.tool !== "select") c.discardActiveObject();
    c.requestRenderAll();
  }

  /* ------------------------------- styling -------------------------------- */

  applyStyle(patch: StylePatch): void {
    const objs = this.canvas.getActiveObjects();
    if (objs.length === 0) return;

    for (const obj of objs) {
      const k = kindOf(obj);

      if (patch.stroke !== undefined) {
        if (obj instanceof fabric.Group) styleArrow(obj, { stroke: patch.stroke });
        else if (k === "shape" || k === "path") obj.set("stroke", patch.stroke);
      }
      if (patch.strokeWidth !== undefined) {
        if (obj instanceof fabric.Group)
          styleArrow(obj, { strokeWidth: patch.strokeWidth });
        else if (k === "shape" || k === "path")
          obj.set("strokeWidth", patch.strokeWidth);
      }
      if (patch.fill !== undefined) {
        if (k === "shape" && !(obj instanceof fabric.Group)) obj.set("fill", patch.fill);
      }
      if (patch.textColor !== undefined && (k === "text" || k === "note")) {
        obj.set("fill", patch.textColor);
      }
      if (patch.noteFill !== undefined && k === "note") {
        obj.set("backgroundColor", patch.noteFill);
      }
      if (patch.fontSize !== undefined && (k === "text" || k === "note")) {
        obj.set("fontSize", patch.fontSize);
        (obj as fabric.Textbox).initDimensions?.();
      }
      if (patch.bold !== undefined && k === "text") {
        obj.set("fontWeight", patch.bold ? "bold" : "normal");
      }
      if (patch.textAlign !== undefined && (k === "text" || k === "note")) {
        obj.set("textAlign", patch.textAlign);
      }
      obj.set("dirty", true);
    }

    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /* ---------------------------- duplicate / clip -------------------------- */

  async copySelection(): Promise<void> {
    const active = this.canvas.getActiveObject();
    if (!active) return;
    this.clipboard = await active.clone();
  }

  async pasteClipboard(): Promise<void> {
    if (!this.clipboard) return;
    await this.placeClone(await this.clipboard.clone());
  }

  async duplicateSelection(): Promise<void> {
    const active = this.canvas.getActiveObject();
    if (!active) return;
    await this.placeClone(await active.clone());
  }

  private async placeClone(clone: fabric.FabricObject): Promise<void> {
    this.canvas.discardActiveObject();
    clone.set({
      left: (clone.left ?? 0) + 24,
      top: (clone.top ?? 0) + 24,
      evented: true,
      selectable: true,
    });
    if (clone instanceof fabric.ActiveSelection) {
      clone.canvas = this.canvas;
      clone.forEachObject((o) => this.canvas.add(o));
      clone.setCoords();
    } else {
      this.canvas.add(clone);
    }
    this.setTool("select");
    this.canvas.setActiveObject(clone);
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  selectAllObjects(): void {
    this.setTool("select");
    const objs = this.canvas.getObjects();
    if (objs.length === 0) return;
    this.canvas.discardActiveObject();
    if (objs.length === 1) {
      this.canvas.setActiveObject(objs[0]);
    } else {
      const sel = new fabric.ActiveSelection(objs, { canvas: this.canvas });
      this.canvas.setActiveObject(sel);
    }
    this.canvas.requestRenderAll();
    this.emit();
  }

  /* ------------------------------ layer order ----------------------------- */

  private layerOp(fn: (o: fabric.FabricObject) => void): void {
    const objs = this.canvas.getActiveObjects();
    if (objs.length === 0) return;
    objs.forEach(fn);
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  bringForward(): void {
    this.layerOp((o) => this.canvas.bringObjectForward(o));
  }
  sendBackward(): void {
    this.layerOp((o) => this.canvas.sendObjectBackwards(o));
  }
  bringToFront(): void {
    this.layerOp((o) => this.canvas.bringObjectToFront(o));
  }
  sendToBack(): void {
    this.layerOp((o) => this.canvas.sendObjectToBack(o));
  }

  /* ------------------------------ undo/redo ------------------------------- */

  undo(): void {
    const state = this.history.undo();
    if (state !== null) void this.loadSnapshot(state);
  }

  redo(): void {
    const state = this.history.redo();
    if (state !== null) void this.loadSnapshot(state);
  }

  private runExclusive(task: () => Promise<void>): Promise<void> {
    const run = this.loadQueue.then(task, task);
    this.loadQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private loadSnapshot(json: string): Promise<void> {
    return this.runExclusive(async () => {
      this.suppress = true;
      await this.canvas.loadFromJSON(JSON.parse(json));
      this.suppress = false;
      this.applyToolMode();
      this.canvas.requestRenderAll();
      this.emit();
      this.schedulePersist();
    });
  }

  /* -------------------------------- zoom ---------------------------------- */

  private applyZoom(zoom: number, at?: { x: number; y: number }): void {
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const point = at
      ? new fabric.Point(at.x, at.y)
      : new fabric.Point(this.canvas.getWidth() / 2, this.canvas.getHeight() / 2);
    this.canvas.zoomToPoint(point, z);
    this.updateGrid();
    this.emit();
  }

  zoomIn(): void {
    this.applyZoom(this.canvas.getZoom() * 1.2);
  }
  zoomOut(): void {
    this.applyZoom(this.canvas.getZoom() / 1.2);
  }
  resetZoom(): void {
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this.updateGrid();
    this.emit();
  }

  /* --------------------------- canvas appearance -------------------------- */

  setCanvasStyle(style: CanvasStyle): void {
    this.canvasStyle = style;
    const el = this.paperEl;
    if (style === "blank") {
      el.style.backgroundImage = "none";
    } else if (style === "dots") {
      el.style.backgroundImage = `radial-gradient(circle, ${GRID_COLOR} 1.3px, transparent 1.3px)`;
    } else {
      el.style.backgroundImage =
        `linear-gradient(to right, ${GRID_LINE_COLOR} 1px, transparent 1px), ` +
        `linear-gradient(to bottom, ${GRID_LINE_COLOR} 1px, transparent 1px)`;
    }
    this.updateGrid();
    this.emit();
  }

  private updateGrid(): void {
    if (this.canvasStyle === "blank") return;
    const vpt = this.canvas.viewportTransform;
    const zoom = this.canvas.getZoom();
    const size = GRID_SIZE * zoom;
    this.paperEl.style.backgroundSize = `${size}px ${size}px`;
    this.paperEl.style.backgroundPosition = `${vpt[4]}px ${vpt[5]}px`;
  }

  /* ------------------------------ selection ------------------------------- */

  deleteSelection(): void {
    const active = this.canvas.getActiveObjects();
    if (active.length === 0) return;
    active.forEach((o) => this.canvas.remove(o));
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /* -------------------------------- images -------------------------------- */

  async addImageFile(file: File): Promise<void> {
    const dataUrl = await readFileAsDataURL(file);
    await this.addImageFromDataURL(dataUrl);
  }

  async addImageFromDataURL(
    dataUrl: string,
    at?: { x: number; y: number },
  ): Promise<void> {
    const img = await fabric.FabricImage.fromURL(dataUrl);
    const maxDim = 520;
    const scale = Math.min(1, maxDim / Math.max(img.width ?? 1, img.height ?? 1));
    img.scale(scale);

    const center = at ?? this.viewportCenterScene();
    img.set({ left: center.x, top: center.y, originX: "center", originY: "center" });
    img.selectable = this.tool === "select";
    img.evented = this.tool === "select" || this.tool === "eraser";

    this.canvas.add(img);
    this.canvas.setActiveObject(img);
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  private viewportCenterScene(): { x: number; y: number } {
    const inv = fabric.util.invertTransform(this.canvas.viewportTransform);
    const p = fabric.util.transformPoint(
      new fabric.Point(this.canvas.getWidth() / 2, this.canvas.getHeight() / 2),
      inv,
    );
    return { x: p.x, y: p.y };
  }

  /* ------------------------------ text / note ----------------------------- */

  private createTextAt(x: number, y: number): void {
    const text = new fabric.IText("", {
      left: x,
      top: y,
      fontSize: this.defaults.textFontSize,
      fill: this.defaults.textColor,
      fontFamily: CANVAS_FONT,
    });
    this.setTool("select");
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    text.enterEditing();
    text.hiddenTextarea?.focus();
    this.canvas.requestRenderAll();
  }

  /* ------------------------------- documents ------------------------------ */

  loadDoc(doc: CanvasDoc | undefined): Promise<void> {
    return this.runExclusive(async () => {
      this.suppress = true;
      if (doc && Object.keys(doc).length > 0) {
        await this.canvas.loadFromJSON(doc);
      } else {
        this.canvas.clear();
      }
      this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      this.suppress = false;
      this.applyToolMode();
      this.updateGrid();
      this.canvas.requestRenderAll();
      this.history.reset(this.snapshot());
      this.emit();
    });
  }

  clearPage(): void {
    void this.runExclusive(async () => {
      this.suppress = true;
      this.canvas.clear();
      this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      this.suppress = false;
      this.updateGrid();
      this.applyToolMode();
      this.canvas.requestRenderAll();
      this.history.reset(this.snapshot());
      this.emit();
      this.flush();
    });
  }

  /* -------------------------------- export -------------------------------- */

  exportPNG(fileName = "notedrift"): void {
    const c = this.canvas;
    const objects = c.getObjects();
    const prevVpt = [...c.viewportTransform] as fabric.TMat2D;
    const prevBg = c.backgroundColor;
    const prevW = c.getWidth();
    const prevH = c.getHeight();

    c.discardActiveObject();
    this.activeGuides = [];

    let dataUrl: string;

    if (objects.length === 0) {
      c.backgroundColor = "#ffffff";
      c.renderAll();
      dataUrl = c.toDataURL({ format: "png", multiplier: 2 });
    } else {
      const b = this.contentBounds(objects);
      const pad = 48;
      const w = Math.ceil(b.width + pad * 2);
      const h = Math.ceil(b.height + pad * 2);
      const multiplier = w * 2 > 12000 || h * 2 > 12000 ? 1 : 2;

      c.setDimensions({ width: w, height: h });
      c.setViewportTransform([1, 0, 0, 1, -b.left + pad, -b.top + pad]);
      c.backgroundColor = "#ffffff";
      c.renderAll();
      dataUrl = c.toDataURL({ format: "png", multiplier });

      c.setDimensions({ width: prevW, height: prevH });
      c.setViewportTransform(prevVpt);
    }

    c.backgroundColor = prevBg;
    this.updateGrid();
    c.renderAll();

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${fileName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private contentBounds(objects: fabric.FabricObject[]): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const o of objects) {
      o.setCoords();
      const c = o.aCoords;
      if (!c) continue;
      for (const p of [c.tl, c.tr, c.bl, c.br]) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  }

  /* -------------------------- alignment guides ---------------------------- */

  private sceneBounds(obj: fabric.FabricObject) {
    const c = obj.aCoords;
    const xs = [c.tl.x, c.tr.x, c.br.x, c.bl.x];
    const ys = [c.tl.y, c.tr.y, c.br.y, c.bl.y];
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
  }

  private applySnap(obj: fabric.FabricObject): void {
    const zoom = this.canvas.getZoom();
    const threshold = SNAP_SCREEN_PX / zoom;
    obj.setCoords();
    const b = this.sceneBounds(obj);
    const selected = new Set(this.canvas.getActiveObjects());

    const movingX = [b.left, b.cx, b.right];
    const movingY = [b.top, b.cy, b.bottom];

    let bestV: { delta: number; pos: number } | null = null;
    let bestH: { delta: number; pos: number } | null = null;

    this.canvas.forEachObject((o) => {
      if (o === obj || selected.has(o)) return;
      o.setCoords();
      const ob = this.sceneBounds(o);
      const targetX = [ob.left, ob.cx, ob.right];
      const targetY = [ob.top, ob.cy, ob.bottom];
      for (const mv of movingX)
        for (const tv of targetX) {
          const d = tv - mv;
          if (Math.abs(d) <= threshold && (!bestV || Math.abs(d) < Math.abs(bestV.delta)))
            bestV = { delta: d, pos: tv };
        }
      for (const mv of movingY)
        for (const tv of targetY) {
          const d = tv - mv;
          if (Math.abs(d) <= threshold && (!bestH || Math.abs(d) < Math.abs(bestH.delta)))
            bestH = { delta: d, pos: tv };
        }
    });

    const guides: Guide[] = [];
    if (bestV) {
      obj.set("left", (obj.left ?? 0) + (bestV as { delta: number }).delta);
      guides.push({ axis: "v", pos: (bestV as { pos: number }).pos });
    }
    if (bestH) {
      obj.set("top", (obj.top ?? 0) + (bestH as { delta: number }).delta);
      guides.push({ axis: "h", pos: (bestH as { pos: number }).pos });
    }
    if (bestV || bestH) obj.setCoords();
    this.activeGuides = guides;
  }

  private drawGuides(): void {
    if (this.activeGuides.length === 0) return;
    const ctx = this.canvas.contextTop;
    if (!ctx) return;
    const vpt = this.canvas.viewportTransform;
    const retina = this.canvas.getRetinaScaling();
    const W = this.canvas.getWidth();
    const H = this.canvas.getHeight();
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    ctx.strokeStyle = "rgba(91, 140, 255, 0.95)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    for (const g of this.activeGuides) {
      ctx.beginPath();
      if (g.axis === "v") {
        const x = g.pos * vpt[0] + vpt[4];
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      } else {
        const y = g.pos * vpt[3] + vpt[5];
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private endInteraction(): void {
    if (!this.interacting && this.activeGuides.length === 0) return;
    this.interacting = false;
    this.activeGuides = [];
    this.canvas.requestRenderAll();
  }

  /* ------------------------------ event wiring ---------------------------- */

  private wireEvents(): void {
    this.canvas.on("mouse:down", this.onMouseDown);
    this.canvas.on("mouse:move", this.onMouseMove);
    this.canvas.on("mouse:up", this.onMouseUp);
    this.canvas.on("mouse:wheel", this.onWheel);
    this.canvas.on("mouse:dblclick", this.onDblClick);
    this.canvas.on("after:render", () => this.drawGuides());

    this.canvas.on("object:moving", (opt) => {
      const obj = opt.target;
      if (!obj) return;
      this.interacting = true;
      this.applySnap(obj);
      this.canvas.requestRenderAll();
      this.emit();
    });
    this.canvas.on("object:scaling", () => {
      this.interacting = true;
      this.emit();
    });
    this.canvas.on("object:rotating", () => {
      this.interacting = true;
      this.emit();
    });

    this.canvas.on("path:created", () => {
      this.recordHistory();
      this.schedulePersist();
    });
    this.canvas.on("object:modified", () => {
      this.endInteraction();
      this.recordHistory();
      this.schedulePersist();
    });
    this.canvas.on("text:changed", () => this.schedulePersist());
    this.canvas.on("text:editing:exited", () => {
      this.recordHistory();
      this.schedulePersist();
    });
    this.canvas.on("selection:created", () => this.emit());
    this.canvas.on("selection:updated", () => this.emit());
    this.canvas.on("selection:cleared", () => {
      this.endInteraction();
      this.emit();
    });
  }

  private onDblClick = (opt: PointerInfo): void => {
    if (this.tool !== "select" || opt.target) return;
    const p = this.canvas.getScenePoint(opt.e);
    this.createTextAt(p.x, p.y);
  };

  private onMouseDown = (opt: PointerInfo): void => {
    const e = opt.e as MouseEvent;

    if (this.spaceDown || e.button === 1) {
      this.isPanning = true;
      this.lastPan = { x: e.clientX, y: e.clientY };
      this.canvas.setCursor("grabbing");
      return;
    }

    if (this.tool === "eraser") {
      this.isErasing = true;
      if (opt.target) this.canvas.remove(opt.target);
      return;
    }

    if (this.tool === "select") return;

    const p = this.canvas.getScenePoint(opt.e);
    this.start = { x: p.x, y: p.y };
    this.cur = { x: p.x, y: p.y };

    if (this.tool === "text") {
      this.createTextAt(p.x, p.y);
      return;
    }

    if (this.tool === "note") {
      const note = makeStickyNote(p.x, p.y, this.defaults.noteFill);
      this.setTool("select");
      this.canvas.add(note);
      this.canvas.setActiveObject(note);
      note.enterEditing();
      note.hiddenTextarea?.focus();
      this.canvas.requestRenderAll();
      this.recordHistory();
      this.schedulePersist();
      return;
    }

    this.drawing = true;
    let draft: fabric.FabricObject;
    if (this.tool === "rect") {
      draft = new fabric.Rect({
        left: p.x,
        top: p.y,
        width: 0,
        height: 0,
        rx: 3,
        ry: 3,
        fill: this.defaults.shapeFill,
        stroke: this.defaults.shapeStroke,
        strokeWidth: this.defaults.shapeStrokeWidth,
        strokeUniform: true,
      });
    } else if (this.tool === "ellipse") {
      draft = new fabric.Ellipse({
        left: p.x,
        top: p.y,
        rx: 0,
        ry: 0,
        fill: this.defaults.shapeFill,
        stroke: this.defaults.shapeStroke,
        strokeWidth: this.defaults.shapeStrokeWidth,
        strokeUniform: true,
      });
    } else {
      draft = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: this.defaults.lineStroke,
        strokeWidth: this.defaults.lineStrokeWidth,
        strokeLineCap: "round",
        strokeUniform: true,
      });
    }
    draft.selectable = false;
    draft.evented = false;
    this.draft = draft;
    this.canvas.add(draft);
  };

  private onMouseMove = (opt: PointerInfo): void => {
    const e = opt.e as MouseEvent;

    if (this.isPanning) {
      const dx = e.clientX - this.lastPan.x;
      const dy = e.clientY - this.lastPan.y;
      this.lastPan = { x: e.clientX, y: e.clientY };
      const vpt = this.canvas.viewportTransform;
      vpt[4] += dx;
      vpt[5] += dy;
      this.canvas.setViewportTransform(vpt);
      this.updateGrid();
      return;
    }

    if (this.isErasing) {
      const target = this.canvas.findTarget(opt.e)?.target;
      if (target) this.canvas.remove(target);
      return;
    }

    if (!this.drawing || !this.draft) return;

    const p = this.canvas.getScenePoint(opt.e);
    this.cur = { x: p.x, y: p.y };
    const { x: sx, y: sy } = this.start;

    if (this.tool === "rect") {
      this.draft.set({
        left: Math.min(sx, p.x),
        top: Math.min(sy, p.y),
        width: Math.abs(p.x - sx),
        height: Math.abs(p.y - sy),
      });
    } else if (this.tool === "ellipse") {
      (this.draft as fabric.Ellipse).set({
        left: Math.min(sx, p.x),
        top: Math.min(sy, p.y),
        rx: Math.abs(p.x - sx) / 2,
        ry: Math.abs(p.y - sy) / 2,
      });
    } else {
      (this.draft as fabric.Line).set({ x2: p.x, y2: p.y });
    }
    this.draft.setCoords();
    this.canvas.requestRenderAll();
  };

  private onMouseUp = (): void => {
    if (this.interacting) this.endInteraction();

    if (this.isPanning) {
      this.isPanning = false;
      this.setSpace(this.spaceDown);
      return;
    }

    if (this.isErasing) {
      this.isErasing = false;
      this.recordHistory();
      this.schedulePersist();
      return;
    }

    if (!this.drawing) return;
    this.drawing = false;

    const draft = this.draft;
    this.draft = null;
    if (!draft) return;

    const { x: sx, y: sy } = this.start;
    const { x: ex, y: ey } = this.cur;
    const dist = Math.hypot(ex - sx, ey - sy);
    const tool = this.tool;

    const tooSmall =
      tool === "rect" || tool === "ellipse"
        ? Math.abs(ex - sx) < 4 && Math.abs(ey - sy) < 4
        : dist < 4;

    if (tooSmall) {
      this.canvas.remove(draft);
      this.canvas.requestRenderAll();
      this.setTool("select");
      return;
    }

    if (tool === "arrow") {
      this.canvas.remove(draft);
      const arrow = makeArrow(
        sx,
        sy,
        ex,
        ey,
        this.defaults.lineStroke,
        this.defaults.lineStrokeWidth,
      );
      this.canvas.add(arrow);
      this.canvas.setActiveObject(arrow);
    } else {
      draft.setCoords();
      this.canvas.setActiveObject(draft);
    }

    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
    this.setTool("select");
  };

  private onWheel = (opt: WheelInfo): void => {
    const e = opt.e;
    e.preventDefault();
    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      let zoom = this.canvas.getZoom();
      zoom *= Math.pow(0.999, e.deltaY * 2);
      const vp = this.canvas.getViewportPoint(opt.e);
      this.applyZoom(zoom, { x: vp.x, y: vp.y });
    } else {
      const vpt = this.canvas.viewportTransform;
      vpt[4] -= e.deltaX;
      vpt[5] -= e.deltaY;
      this.canvas.setViewportTransform(vpt);
      this.updateGrid();
      this.emit();
    }
  };
}

/* --------------------------------- utils ---------------------------------- */

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
