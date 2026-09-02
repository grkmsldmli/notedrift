// CanvasController: the imperative core of the NoteDrift editor.
//
// It owns the Fabric canvas and all interaction logic (tools, drawing, zoom/pan,
// history, autosave, export). React never touches Fabric directly — it creates
// one controller, subscribes to state via `onState`, and calls public methods.

import * as fabric from "fabric";
import {
  CANVAS_FONT,
  COLORS,
  GRID_COLOR,
  GRID_LINE_COLOR,
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  PEN_WIDTH,
  STROKE_WIDTH,
} from "./constants";
import { History } from "./history";
import { makeArrow, makeStickyNote } from "./shapes";
import type { CanvasDoc, CanvasStyle, EditorState, Tool } from "./types";

export interface ControllerCallbacks {
  onState: (state: EditorState) => void;
  /** Called (debounced) with the latest canvas document to persist. */
  onPersist: (doc: CanvasDoc) => void;
}

type PointerInfo = fabric.TPointerEventInfo<fabric.TPointerEvent>;
type WheelInfo = fabric.TPointerEventInfo<WheelEvent>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Autosave debounce: save ~0.5s after the last change, but never let more than
// PERSIST_MAXWAIT elapse during continuous activity.
const PERSIST_IDLE = 500;
const PERSIST_MAXWAIT = 4000;

export class CanvasController {
  readonly canvas: fabric.Canvas;
  private readonly paperEl: HTMLElement;
  private readonly cb: ControllerCallbacks;
  private readonly history = new History();

  private tool: Tool = "select";
  private canvasStyle: CanvasStyle;

  // Interaction state
  private suppress = false; // suppress history/persist during programmatic loads
  private disposed = false;
  private drawing = false;
  private draft: fabric.FabricObject | null = null;
  private start = { x: 0, y: 0 };
  private cur = { x: 0, y: 0 };
  private isPanning = false;
  private isErasing = false;
  private spaceDown = false;
  private lastPan = { x: 0, y: 0 };
  private clipboard: fabric.FabricObject | null = null;

  // Autosave bookkeeping
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistPending = false;
  private lastPersistAt = 0;

  // rAF-coalesced state emission (avoids a React render per raw event)
  private emitScheduled = false;

  // Serializes async canvas loads so rapid undo/redo/page-switches can't
  // interleave `loadFromJSON` calls and corrupt the result.
  private loadQueue: Promise<void> = Promise.resolve();

  constructor(
    el: HTMLCanvasElement,
    paperEl: HTMLElement,
    cb: ControllerCallbacks,
    style: CanvasStyle,
  ) {
    this.paperEl = paperEl;
    this.cb = cb;
    this.canvasStyle = style;

    this.canvas = new fabric.Canvas(el, {
      preserveObjectStacking: true,
      selection: true,
      fireRightClick: false,
      stopContextMenu: true,
      enableRetinaScaling: true,
      backgroundColor: undefined, // transparent: the white paper shows through
    });

    this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    this.canvas.freeDrawingBrush.color = COLORS.ink;
    this.canvas.freeDrawingBrush.width = PEN_WIDTH;

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

  private getState(): EditorState {
    return {
      tool: this.tool,
      zoom: this.canvas.getZoom(),
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      canvasStyle: this.canvasStyle,
      hasSelection: this.canvas.getActiveObjects().length > 0,
    };
  }

  // Coalesce many rapid emits (drawing, zoom, pan) into one React update/frame.
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

  /** Persist the current document immediately (page switch, unload, new page). */
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
      c.freeDrawingBrush.color = COLORS.ink;
      c.freeDrawingBrush.width = PEN_WIDTH;
    }

    c.selection = this.tool === "select";
    // Only "select" and "eraser" need to hit-test objects.
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

  /* ---------------------------- clipboard / all --------------------------- */

  async copySelection(): Promise<void> {
    const active = this.canvas.getActiveObject();
    if (!active) return;
    this.clipboard = await active.clone();
  }

  async pasteClipboard(): Promise<void> {
    if (!this.clipboard) return;
    const clone = await this.clipboard.clone();
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
      fontSize: 24,
      fill: COLORS.ink,
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

  /** Load a page document (or clear if undefined/empty). Resets history. */
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

  /** Reset to a blank page (New Page). Persists the empty doc. */
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

  /** Export all content as a PNG (2x) on a white background and download it. */
  exportPNG(fileName = "notedrift"): void {
    const c = this.canvas;
    const objects = c.getObjects();
    const prevVpt = [...c.viewportTransform] as fabric.TMat2D;
    const prevBg = c.backgroundColor;
    const prevW = c.getWidth();
    const prevH = c.getHeight();

    // Never export while an object is selected — selection handles are UI, and
    // they render onto the upper canvas, not the export, but discarding keeps
    // the exported bitmap unquestionably content-only.
    c.discardActiveObject();

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
      // Keep the exported bitmap within a sane pixel budget.
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

  private contentBounds(
    objects: fabric.FabricObject[],
  ): { left: number; top: number; width: number; height: number } {
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

  /* ------------------------------ event wiring ---------------------------- */

  private wireEvents(): void {
    this.canvas.on("mouse:down", this.onMouseDown);
    this.canvas.on("mouse:move", this.onMouseMove);
    this.canvas.on("mouse:up", this.onMouseUp);
    this.canvas.on("mouse:wheel", this.onWheel);
    this.canvas.on("mouse:dblclick", this.onDblClick);

    this.canvas.on("path:created", () => {
      // A freehand pen stroke finished.
      this.recordHistory();
      this.schedulePersist();
    });
    this.canvas.on("object:modified", () => {
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
    this.canvas.on("selection:cleared", () => this.emit());
  }

  private onDblClick = (opt: PointerInfo): void => {
    // Double-clicking empty canvas (in select mode) drops a text object ready
    // to type. Double-clicking an existing object is left to Fabric (e.g. text
    // editing).
    if (this.tool !== "select" || opt.target) return;
    const p = this.canvas.getScenePoint(opt.e);
    this.createTextAt(p.x, p.y);
  };

  private onMouseDown = (opt: PointerInfo): void => {
    const e = opt.e as MouseEvent;

    // Pan: hold space, or middle-mouse button.
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

    if (this.tool === "select") return; // native Fabric selection/drag

    const p = this.canvas.getScenePoint(opt.e);
    this.start = { x: p.x, y: p.y };
    this.cur = { x: p.x, y: p.y };

    if (this.tool === "text") {
      this.createTextAt(p.x, p.y);
      return;
    }

    if (this.tool === "note") {
      const note = makeStickyNote(p.x, p.y);
      this.setTool("select");
      this.canvas.add(note);
      this.canvas.setActiveObject(note);
      note.enterEditing();
      note.selectAll();
      note.hiddenTextarea?.focus();
      this.canvas.requestRenderAll();
      this.recordHistory();
      this.schedulePersist();
      return;
    }

    // rect / ellipse / line / arrow: begin a drag-draw.
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
        fill: "transparent",
        stroke: COLORS.ink,
        strokeWidth: STROKE_WIDTH,
      });
    } else if (this.tool === "ellipse") {
      draft = new fabric.Ellipse({
        left: p.x,
        top: p.y,
        rx: 0,
        ry: 0,
        fill: "transparent",
        stroke: COLORS.ink,
        strokeWidth: STROKE_WIDTH,
      });
    } else {
      // line and arrow both preview as a line
      draft = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: COLORS.ink,
        strokeWidth: STROKE_WIDTH,
        strokeLineCap: "round",
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
      // Fabric v7's findTarget returns a target-info object, not the object.
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

    // Discard accidental tiny drags.
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
      const arrow = makeArrow(sx, sy, ex, ey, COLORS.ink, STROKE_WIDTH);
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
      // Pinch-to-zoom (trackpad) or Ctrl+wheel: zoom toward the pointer.
      let zoom = this.canvas.getZoom();
      zoom *= Math.pow(0.999, e.deltaY * 2);
      const vp = this.canvas.getViewportPoint(opt.e);
      this.applyZoom(zoom, { x: vp.x, y: vp.y });
    } else {
      // Plain scroll / two-finger swipe: pan.
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
