// Brush materials — what makes each drawing instrument feel distinct.
//
// Every brush uses the SAME Phase 1.6A freehand engine (never Fabric's
// PencilBrush). A material sets the fixed geometric/visual character (edge
// smoothing, how width responds to pressure/velocity, whether it draws
// translucent) plus the sensible starting defaults a fresh install gets. The
// user's own per-tool preferences (color/width/opacity/stabilization/pressure)
// override the defaults and persist.

import type { DrawTool, PenStabilization } from "../types";

export interface BrushMaterial {
  id: DrawTool;
  label: string;
  /** perfect-freehand corner smoothing — low = crisp/precise, high = soft. */
  smoothing: number;
  /** Max width variation when pressure/dynamics are active (0 = never varies). */
  thinning: number;
  /** Velocity-based width dynamics (Brush) when no real stylus pressure. This is
   *  brush dynamics, explicitly NOT simulated hardware pressure. */
  dynamics: boolean;
  /** Whether a width-response (pressure / dynamics) control is meaningful. */
  variableWidth: boolean;
  /** Whether an opacity control is meaningful for this instrument. */
  showOpacity: boolean;
  /** Defaults applied on first use (and for any tool a saved config lacks). */
  defaults: {
    width: number;
    opacity: number;
    stabilization: PenStabilization;
    pressure: boolean;
    color?: string; // omit → graphite
  };
}

const GRAPHITE = "#20242e";

export const BRUSH_MATERIALS: Record<DrawTool, BrushMaterial> = {
  pen: {
    id: "pen",
    label: "Pen",
    smoothing: 0.55,
    thinning: 0.5,
    dynamics: false,
    variableWidth: true,
    showOpacity: false,
    defaults: { width: 4, opacity: 1, stabilization: "low", pressure: false },
  },
  pencil: {
    id: "pencil",
    label: "Pencil",
    // Slightly crisper edge + lower opacity reads as lighter graphite.
    smoothing: 0.5,
    thinning: 0.45,
    dynamics: false,
    variableWidth: true,
    showOpacity: true,
    defaults: { width: 3, opacity: 0.82, stabilization: "low", pressure: false },
  },
  marker: {
    id: "marker",
    label: "Marker",
    // Wider + softer edge + near-solid coverage: visually heavier than Pen.
    smoothing: 0.66,
    thinning: 0.28,
    dynamics: false,
    variableWidth: true,
    showOpacity: true,
    defaults: { width: 12, opacity: 0.92, stabilization: "low", pressure: false },
  },
  highlighter: {
    id: "highlighter",
    label: "Highlighter",
    // Wide, flat, translucent — fixed width so it lays down evenly over content.
    smoothing: 0.5,
    thinning: 0,
    dynamics: false,
    variableWidth: false,
    showOpacity: true,
    defaults: {
      width: 24,
      opacity: 0.3,
      stabilization: "off",
      pressure: false,
      color: "#fbbf24",
    },
  },
  brush: {
    id: "brush",
    label: "Brush",
    // Expressive: strong width response, velocity dynamics with a mouse and real
    // pressure with a stylus.
    smoothing: 0.6,
    thinning: 0.75,
    dynamics: true,
    variableWidth: true,
    showOpacity: true,
    defaults: { width: 10, opacity: 1, stabilization: "low", pressure: true },
  },
  technical: {
    id: "technical",
    label: "Technical",
    // Very clean, uniform, minimal smoothing — precise diagram lines.
    smoothing: 0.22,
    thinning: 0,
    dynamics: false,
    variableWidth: false,
    showOpacity: false,
    defaults: { width: 2, opacity: 1, stabilization: "off", pressure: false },
  },
};

export const DRAW_TOOLS: DrawTool[] = [
  "pen",
  "pencil",
  "marker",
  "highlighter",
  "brush",
  "technical",
];

export function materialFor(tool: DrawTool): BrushMaterial {
  return BRUSH_MATERIALS[tool];
}

export function defaultPrefsFor(tool: DrawTool) {
  const m = BRUSH_MATERIALS[tool];
  return {
    color: m.defaults.color ?? GRAPHITE,
    width: m.defaults.width,
    opacity: m.defaults.opacity,
    stabilization: m.defaults.stabilization,
    pressure: m.defaults.pressure,
  };
}

/** Discrete width presets offered for drawing tools. */
export const WIDTH_PRESETS = [1, 2, 4, 6, 10, 16, 24, 40];
export const MIN_WIDTH = 1;
export const MAX_WIDTH = 64;
