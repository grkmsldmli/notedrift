// The tool registry instance (Phase 1.6A foundation).
//
// Register once at module load; look up by id. Today the only behavior driven
// through the registry is Pen's freehand brush — everything else is metadata the
// registry will grow into (library, favorites, command palette) in later phases.

import type { Tool } from "../types";
import type { BrushSpec, ToolCategory, ToolDefinition } from "./types";

const registry = new Map<Tool, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  registry.set(def.id, def);
}

export function getToolDef(id: Tool): ToolDefinition | undefined {
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
// Pen is the one tool whose behavior flows through the registry in 1.6A.
registerTool({ id: "pen", label: "Pen", category: "draw", brush: { kind: "freehand" } });

// Metadata-only for now; existing controller logic still drives these.
registerTool({ id: "select", label: "Select", category: "organize" });
registerTool({ id: "text", label: "Text", category: "write" });
registerTool({ id: "rect", label: "Rectangle", category: "shape" });
registerTool({ id: "ellipse", label: "Ellipse", category: "shape" });
registerTool({ id: "line", label: "Line", category: "shape" });
registerTool({ id: "arrow", label: "Arrow", category: "shape" });
registerTool({ id: "note", label: "Sticky note", category: "write" });
registerTool({ id: "eraser", label: "Eraser", category: "organize" });
