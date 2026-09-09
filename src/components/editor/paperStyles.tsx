import { Grid2x2, Grid3x3, Grip, Minus, Ruler, Square } from "lucide-react";
import type { CanvasStyle } from "@/lib/types";

// Single source of truth for the paper/canvas-style labels + icons. Shared by the
// desktop zoom menu (ZoomControls) and the touch-first Paper control (PaperControl)
// so both present the identical set and stay in sync.
export const PAPER_STYLES: { id: CanvasStyle; label: string; icon: React.ReactNode }[] = [
  { id: "blank", label: "Blank", icon: <Square size={16} /> },
  { id: "dots", label: "Dots", icon: <Grip size={16} /> },
  { id: "grid", label: "Grid", icon: <Grid3x3 size={16} /> },
  { id: "lines", label: "Lines", icon: <Minus size={16} /> },
  { id: "graph", label: "Graph", icon: <Grid2x2 size={16} /> },
  { id: "engineering", label: "Engineering", icon: <Ruler size={16} /> },
];

export function paperStyleLabel(id: CanvasStyle): string {
  return PAPER_STYLES.find((s) => s.id === id)?.label ?? "Paper";
}
