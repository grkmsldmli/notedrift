// The tool registry instance (Phase 1.6A foundation).
//
// Register once at module load; look up by id. Today the only behavior driven
// through the registry is Pen's freehand brush — everything else is metadata the
// registry will grow into (library, favorites, command palette) in later phases.

import type { Tool } from "../types";
import type { BrushSpec, ToolCategory, ToolDefinition, ToolId } from "./types";

const registry = new Map<ToolId, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  registry.set(def.id, def);
}

export function getToolDef(id: ToolId): ToolDefinition | undefined {
  return registry.get(id);
}

export function allToolDefs(): ToolDefinition[] {
  return [...registry.values()];
}

export function toolsInCategory(category: ToolCategory): ToolDefinition[] {
  return allToolDefs().filter((d) => d.category === category);
}

/** The freehand brush spec for a tool, if it draws freehand. */
export function brushSpecFor(id: Tool): BrushSpec | undefined {
  return registry.get(id)?.brush;
}

// --- Seed --------------------------------------------------------------------
// The freehand drawing family: behavior flows through the registry (brush spec)
// and the active material (src/lib/brush/materials.ts).
registerTool({ id: "pen", label: "Pen", category: "draw", icon: "Pen", slot: "draw", brush: { kind: "freehand" } });
registerTool({ id: "pencil", label: "Pencil", category: "draw", icon: "Pencil", slot: "draw", brush: { kind: "freehand" } });
registerTool({ id: "marker", label: "Marker", category: "draw", icon: "PenLine", slot: "draw", brush: { kind: "freehand" } });
registerTool({ id: "highlighter", label: "Highlighter", category: "draw", icon: "Highlighter", slot: "draw", brush: { kind: "freehand" } });
registerTool({ id: "brush", label: "Brush", category: "draw", icon: "Paintbrush", slot: "draw", brush: { kind: "freehand" } });
registerTool({ id: "technical", label: "Technical", category: "draw", icon: "PenTool", slot: "draw", brush: { kind: "freehand" } });

// Metadata (label/icon/category/slot); existing controller logic still drives these.
registerTool({ id: "select", label: "Select", category: "organize", icon: "MousePointer2" });
registerTool({ id: "lasso", label: "Lasso select", category: "organize", icon: "Lasso", slot: "lasso" });
registerTool({ id: "hand", label: "Hand", category: "navigate", icon: "Hand", slot: "hand" });
registerTool({ id: "text", label: "Text", category: "write", icon: "Type", slot: "text" });
registerTool({ id: "note", label: "Sticky note", category: "write", icon: "StickyNote", slot: "note" });
registerTool({ id: "rect", label: "Shapes", category: "shape", icon: "Shapes", slot: "shapes" });
registerTool({ id: "ellipse", label: "Ellipse", category: "shape", icon: "Circle" });
registerTool({ id: "line", label: "Line", category: "shape", icon: "Minus", slot: "line" });
registerTool({ id: "arrow", label: "Arrow", category: "shape", icon: "ArrowRight" });
registerTool({ id: "eraser", label: "Eraser", category: "organize", icon: "Eraser", slot: "eraser" });
// Phase 1.6F — Image joins the registry as a one-shot insert action (the picker
// stays a button; this makes Image a first-class citizen for the 1.6G library).
registerTool({ id: "image", label: "Insert image", category: "insert", icon: "Image", slot: "image", action: "pick-image" });
