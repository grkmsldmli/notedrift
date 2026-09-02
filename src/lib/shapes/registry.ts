// The shape family registry.
//
// Every shape is a native Fabric object (Rect / Ellipse / Polygon / Path) tagged
// with `ndShape` (its id) plus any editable params (ndSides / ndPoints / ndInner;
// rounded-rect uses the native rx). Because they are native objects they
// serialize, clone, reload, undo and export for free. `make` builds a shape at a
// default size; `resize` fits an existing draft to a drawn box (rect/ellipse by
// dimensions, polygon/path by scale) — the controller re-centres it each frame.

import * as fabric from "fabric";
import { nid } from "../connectors";
import {
  CLOUD_PATH,
  DATABASE_PATH,
  DOCUMENT_PATH,
  SHAPE_REF,
  diamondPoints,
  polygonPoints,
  starPoints,
  trianglePoints,
} from "./geometry";

export type ShapeCategory = "basic" | "diagram";

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
  dash: number[] | null;
  opacity: number;
}

export interface ShapeParams {
  radius: number;
  sides: number;
  points: number;
  inner: number;
}

export interface ShapeDef {
  id: string;
  label: string;
  category: ShapeCategory;
  defaultSize: { w: number; h: number };
  /** Which shape-specific control the toolbar should offer. */
  radius?: boolean;
  sides?: boolean;
  star?: boolean;
  make(style: ShapeStyle, params: ShapeParams): fabric.FabricObject;
  resize(obj: fabric.FabricObject, w: number, h: number): void;
}

export const DEFAULT_SHAPE_PARAMS: ShapeParams = {
  radius: 16,
  sides: 6,
  points: 5,
  inner: 0.45,
};

type Tagged = fabric.FabricObject & {
  ndShape?: string;
  ndSides?: number;
  ndPoints?: number;
  ndInner?: number;
};

function styleProps(s: ShapeStyle): Record<string, unknown> {
  return {
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    fill: s.fill,
    strokeDashArray: s.dash,
    opacity: s.opacity,
    strokeUniform: true,
    objectCaching: true,
  };
}

function tag(o: fabric.FabricObject, id: string, extra?: Record<string, number>): void {
  const t = o as Tagged;
  t.ndShape = id;
  (o as { ndId?: string }).ndId = nid();
  if (extra) Object.assign(t, extra);
}

/** Scale a reference-box (100x100) polygon/path object to fit w x h. */
function scaleTo(o: fabric.FabricObject, w: number, h: number): void {
  o.set({ scaleX: w / SHAPE_REF, scaleY: h / SHAPE_REF });
  o.setCoords();
}

function rect(id: string, w: number, h: number, rx: number, s: ShapeStyle): fabric.Rect {
  const o = new fabric.Rect({ width: w, height: h, rx, ry: rx, ...styleProps(s) });
  tag(o, id);
  return o;
}

function poly(id: string, pts: { x: number; y: number }[], s: ShapeStyle): fabric.Polygon {
  const o = new fabric.Polygon(pts, styleProps(s));
  tag(o, id);
  return o;
}

function path(id: string, d: string, s: ShapeStyle): fabric.Path {
  const o = new fabric.Path(d, styleProps(s));
  tag(o, id);
  return o;
}

const rectResize = (o: fabric.FabricObject, w: number, h: number) =>
  (o as fabric.Rect).set({ width: w, height: h });

export const SHAPES: ShapeDef[] = [
  // ----- Basic --------------------------------------------------------------
  {
    id: "rect",
    label: "Rectangle",
    category: "basic",
    defaultSize: { w: 160, h: 100 },
    make: (s) => rect("rect", 160, 100, 0, s),
    resize: rectResize,
  },
  {
    id: "roundrect",
    label: "Rounded rectangle",
    category: "basic",
    defaultSize: { w: 160, h: 100 },
    radius: true,
    make: (s, p) => rect("roundrect", 160, 100, p.radius, s),
    resize: rectResize,
  },
  {
    id: "ellipse",
    label: "Ellipse",
    category: "basic",
    defaultSize: { w: 160, h: 110 },
    make: (s) => {
      const o = new fabric.Ellipse({ rx: 80, ry: 55, ...styleProps(s) });
      tag(o, "ellipse");
      return o;
    },
    resize: (o, w, h) => (o as fabric.Ellipse).set({ rx: w / 2, ry: h / 2 }),
  },
  {
    id: "circle",
    label: "Circle",
    category: "basic",
    defaultSize: { w: 120, h: 120 },
    make: (s) => {
      const o = new fabric.Ellipse({ rx: 60, ry: 60, ...styleProps(s) });
      tag(o, "circle");
      return o;
    },
    resize: (o, w, h) => {
      const r = Math.max(w, h) / 2;
      (o as fabric.Ellipse).set({ rx: r, ry: r });
    },
  },
  {
    id: "triangle",
    label: "Triangle",
    category: "basic",
    defaultSize: { w: 130, h: 120 },
    make: (s) => poly("triangle", trianglePoints(), s),
    resize: scaleTo,
  },
  {
    id: "diamond",
    label: "Diamond",
    category: "basic",
    defaultSize: { w: 130, h: 130 },
    make: (s) => poly("diamond", diamondPoints(), s),
    resize: scaleTo,
  },
  {
    id: "polygon",
    label: "Polygon",
    category: "basic",
    defaultSize: { w: 130, h: 130 },
    sides: true,
    make: (s, p) => {
      const o = poly("polygon", polygonPoints(p.sides), s);
      (o as Tagged).ndSides = p.sides;
      return o;
    },
    resize: scaleTo,
  },
  {
    id: "star",
    label: "Star",
    category: "basic",
    defaultSize: { w: 130, h: 130 },
    star: true,
    make: (s, p) => {
      const o = poly("star", starPoints(p.points, p.inner), s);
      (o as Tagged).ndPoints = p.points;
      (o as Tagged).ndInner = p.inner;
      return o;
    },
    resize: scaleTo,
  },
  {
    id: "cloud",
    label: "Cloud",
    category: "basic",
    defaultSize: { w: 160, h: 110 },
    make: (s) => path("cloud", CLOUD_PATH, s),
    resize: scaleTo,
  },
  // ----- Diagram / flowchart ------------------------------------------------
  {
    id: "process",
    label: "Process",
    category: "diagram",
    defaultSize: { w: 160, h: 90 },
    make: (s) => rect("process", 160, 90, 10, s),
    resize: rectResize,
  },
  {
    id: "decision",
    label: "Decision",
    category: "diagram",
    defaultSize: { w: 150, h: 120 },
    make: (s) => poly("decision", diamondPoints(), s),
    resize: scaleTo,
  },
  {
    id: "terminator",
    label: "Start / End",
    category: "diagram",
    defaultSize: { w: 160, h: 64 },
    make: (s) => rect("terminator", 160, 64, 32, s),
    resize: (o, w, h) => {
      const r = Math.min(w, h) / 2;
      (o as fabric.Rect).set({ width: w, height: h, rx: r, ry: r });
    },
  },
  {
    id: "database",
    label: "Database",
    category: "diagram",
    defaultSize: { w: 130, h: 140 },
    make: (s) => path("database", DATABASE_PATH, s),
    resize: scaleTo,
  },
  {
    id: "document",
    label: "Document",
    category: "diagram",
    defaultSize: { w: 150, h: 120 },
    make: (s) => path("document", DOCUMENT_PATH, s),
    resize: scaleTo,
  },
];

const SHAPE_BY_ID = new Map(SHAPES.map((d) => [d.id, d]));
export function shapeDef(id: string): ShapeDef | undefined {
  return SHAPE_BY_ID.get(id);
}
export const SHAPE_IDS = SHAPES.map((d) => d.id);

/** Rebuild a polygon/star's points in place after a side/point/inner change,
 *  preserving its transform and identity. */
export function rebuildPolygon(
  o: fabric.Polygon,
  pts: { x: number; y: number }[],
): void {
  o.set({ points: pts });
  // Recompute the polygon's own bounding box from the new points.
  const dims = (o as unknown as { _calcDimensions: () => { width: number; height: number; left: number; top: number } })._calcDimensions();
  o.set({ width: dims.width, height: dims.height });
  (o as unknown as { pathOffset: { x: number; y: number } }).pathOffset = {
    x: dims.left + dims.width / 2,
    y: dims.top + dims.height / 2,
  };
  o.setCoords();
}
