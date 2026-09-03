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
registerTool({ id: "pen", label: "Pen", category: "draw", brush: { kind: "freehand" } });
registerTool({ id: "pencil", label: "Pencil", category: "draw", brush: { kind: "freehand" } });
registerTool({ id: "marker", label: "Marker", category: "draw", brush: { kind: "freehand" } });
registerTool({ id: "highlighter", label: "Highlighter", category: "draw", brush: { kind: "freehand" } });
registerTool({ id: "brush", label: "Brush", category: "draw", brush: { kind: "freehand" } });
registerTool({ id: "technical", label: "Technical", category: "draw", brush: { kind: "freehand" } });

// Metadata-only for now; existing controller logic still drives these.
registerTool({ id: "select", label: "Select", category: "organize" });
registerTool({ id: "text", label: "Text", category: "write" });
registerTool({ id: "rect", label: "Rectangle", category: "shape" });
registerTool({ id: "ellipse", label: "Ellipse", category: "shape" });
registerTool({ id: "line", label: "Line", category: "shape" });
registerTool({ id: "arrow", label: "Arrow", category: "shape" });
registerTool({ id: "note", label: "Sticky note", category: "write" });
registerTool({ id: "eraser", label: "Eraser", category: "organize" });
// Phase 1.6F — Image joins the registry as a one-shot insert action (the picker
// stays a button; this makes Image a first-class citizen for the 1.6G library).
registerTool({ id: "image", label: "Insert image", category: "insert", action: "pick-image" });
