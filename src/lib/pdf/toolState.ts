// Pure tool + selection state for the PDF editor. No Fabric, no DOM — so the
// style-patch and selection-projection logic can be unit tested in Node. The
// Fabric controller imports these.

import type { FontFamilyKey, PdfOverlay, TextAlign } from "./overlays.ts";

export type PdfTool =
  | "select"
  | "text"
  | "pen"
  | "highlight"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow";

export interface PdfToolStyle {
  strokeColor: string;
  strokeWidth: number; // display pts
  opacity: number; // 0..1 (pen / shapes)
  fill: string | null;
  highlightColor: string;
  fontFamily: FontFamilyKey;
  fontSize: number; // display pts
  bold: boolean;
  italic: boolean;
  align: TextAlign;
}

export const DEFAULT_TOOL_STYLE: PdfToolStyle = {
  strokeColor: "#2f6bff",
  strokeWidth: 3,
  opacity: 1,
  fill: null,
  highlightColor: "#fbe24a",
  fontFamily: "sans",
  fontSize: 18,
  bold: false,
  italic: false,
  align: "left",
};

/** The controls a given tool exposes (drives the context toolbar in tool mode). */
export interface ToolControls {
  color: boolean;
  strokeWidth: boolean;
  opacity: boolean;
  fill: boolean;
  text: boolean; // font family / size / bold / italic / align
  highlight: boolean; // highlight color instead of stroke color
}

export function controlsForTool(tool: PdfTool): ToolControls {
  switch (tool) {
    case "text":
      return { color: true, strokeWidth: false, opacity: false, fill: false, text: true, highlight: false };
    case "pen":
      return { color: true, strokeWidth: true, opacity: true, fill: false, text: false, highlight: false };
    case "highlight":
      return { color: false, strokeWidth: false, opacity: true, fill: false, text: false, highlight: true };
    case "rect":
    case "ellipse":
      return { color: true, strokeWidth: true, opacity: true, fill: true, text: false, highlight: false };
    case "line":
    case "arrow":
      return { color: true, strokeWidth: true, opacity: true, fill: false, text: false, highlight: false };
    default:
      return { color: false, strokeWidth: false, opacity: false, fill: false, text: false, highlight: false };
  }
}

/** A resolved snapshot of the selected overlay for the context toolbar. */
export interface PdfSelection {
  id: string;
  type: PdfOverlay["type"];
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  fill?: string | null;
  fontFamily?: FontFamilyKey;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
}

/** Project an overlay to the controls its context toolbar should show. */
export function selectionOf(o: PdfOverlay): PdfSelection {
  const base = { id: o.id, type: o.type, opacity: o.opacity };
  switch (o.type) {
    case "text":
      return {
        ...base,
        color: o.color,
        fontFamily: o.fontFamily,
        fontSize: o.fontSize,
        bold: o.bold,
        italic: o.italic,
        align: o.align,
      };
    case "freehand":
      return { ...base, color: o.color, strokeWidth: o.width };
    case "highlight":
      return { ...base, color: o.color };
    case "rect":
    case "ellipse":
      return { ...base, color: o.stroke, strokeWidth: o.strokeWidth, fill: o.fill };
    case "line":
    case "arrow":
      return { ...base, color: o.stroke, strokeWidth: o.strokeWidth };
  }
}

/** Apply a context-toolbar style change to an overlay, in its own vocabulary. */
export function applyStylePatch(o: PdfOverlay, patch: Partial<PdfSelection>): PdfOverlay {
  switch (o.type) {
    case "text":
      return {
        ...o,
        color: patch.color ?? o.color,
        fontFamily: patch.fontFamily ?? o.fontFamily,
        fontSize: patch.fontSize ?? o.fontSize,
        bold: patch.bold ?? o.bold,
        italic: patch.italic ?? o.italic,
        align: patch.align ?? o.align,
        opacity: patch.opacity ?? o.opacity,
      };
    case "freehand":
      return { ...o, color: patch.color ?? o.color, width: patch.strokeWidth ?? o.width, opacity: patch.opacity ?? o.opacity };
    case "highlight":
      return { ...o, color: patch.color ?? o.color, opacity: patch.opacity ?? o.opacity };
    case "rect":
      return {
        ...o,
        stroke: patch.color ?? o.stroke,
        strokeWidth: patch.strokeWidth ?? o.strokeWidth,
        fill: patch.fill !== undefined ? patch.fill : o.fill,
        opacity: patch.opacity ?? o.opacity,
      };
    case "ellipse":
      return {
        ...o,
        stroke: patch.color ?? o.stroke,
        strokeWidth: patch.strokeWidth ?? o.strokeWidth,
        fill: patch.fill !== undefined ? patch.fill : o.fill,
        opacity: patch.opacity ?? o.opacity,
      };
    case "line":
    case "arrow":
      return { ...o, stroke: patch.color ?? o.stroke, strokeWidth: patch.strokeWidth ?? o.strokeWidth, opacity: patch.opacity ?? o.opacity };
  }
}
