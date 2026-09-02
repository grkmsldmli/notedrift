"use client";

import { memo } from "react";
import { PenTool } from "lucide-react";
import { PALETTE, SHAPE_FILLS } from "@/lib/constants";
import { DRAW_TOOLS, materialFor } from "@/lib/brush/materials";
import type {
  DrawTool,
  DrawToolPrefs,
  PenStabilization,
  Tool,
  ToolDefaults,
} from "@/lib/types";
import { Divider, Label, Segmented, SwatchRow, WidthPicker } from "../ui/controls";
import { ColorPopover } from "../ui/ColorPopover";
import { OpacityControl, WidthControl } from "../ui/BrushControls";

interface ToolOptionsBarProps {
  tool: Tool;
  defaults: ToolDefaults;
  onSetDefault: (patch: Partial<ToolDefaults>) => void;
  onSetDrawPref: (patch: Partial<DrawToolPrefs>, commit?: boolean) => void;
}

const DRAW_SET = new Set<Tool>(DRAW_TOOLS);

const STABILIZE: { value: string; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

export const ToolOptionsBar = memo(function ToolOptionsBar({
  tool,
  defaults,
  onSetDefault,
  onSetDrawPref,
}: ToolOptionsBarProps) {
  let content: React.ReactNode = null;

  if (DRAW_SET.has(tool)) {
    const draw = tool as DrawTool;
    const mat = materialFor(draw);
    const p = defaults.draw[draw];
    content = (
      <>
        <Label>{mat.label}</Label>
        <ColorPopover
          value={p.color}
          onChange={(c, commit) => onSetDrawPref({ color: c }, commit)}
        />
        <Divider />
        <WidthControl
          value={p.width}
          onChange={(w, commit) => onSetDrawPref({ width: w }, commit)}
        />
        {mat.showOpacity && (
          <>
            <Divider />
            <OpacityControl
              value={p.opacity}
              onChange={(o, commit) => onSetDrawPref({ opacity: o }, commit)}
            />
          </>
        )}
        <Divider />
        <Label>Smooth</Label>
        <Segmented
          options={STABILIZE}
          value={p.stabilization}
          onChange={(v) => onSetDrawPref({ stabilization: v as PenStabilization })}
        />
        {mat.variableWidth && (
          <>
            <Divider />
            <button
              type="button"
              title={
                draw === "brush"
                  ? "Velocity/pressure dynamics"
                  : "Pressure-aware width (stylus)"
              }
              aria-pressed={p.pressure}
              onClick={() => onSetDrawPref({ pressure: !p.pressure })}
              className={[
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                p.pressure
                  ? "bg-nd-accent/15 text-nd-text ring-1 ring-nd-accent/40"
                  : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
              ].join(" ")}
            >
              <PenTool size={14} />
              {draw === "brush" ? "Dynamics" : "Pressure"}
            </button>
          </>
        )}
      </>
    );
  } else if (tool === "rect" || tool === "ellipse") {
    content = (
      <>
        <Label>Stroke</Label>
        <SwatchRow
          options={PALETTE}
          value={defaults.shapeStroke}
          onChange={(v) => onSetDefault({ shapeStroke: v })}
        />
        <Divider />
        <WidthPicker
          value={defaults.shapeStrokeWidth}
          onChange={(w) => onSetDefault({ shapeStrokeWidth: w })}
        />
        <Divider />
        <Label>Fill</Label>
        <SwatchRow
          options={SHAPE_FILLS}
          value={defaults.shapeFill}
          onChange={(v) => onSetDefault({ shapeFill: v })}
        />
      </>
    );
  } else if (tool === "line" || tool === "arrow") {
    content = (
      <>
        <Label>Stroke</Label>
        <SwatchRow
          options={PALETTE}
          value={defaults.lineStroke}
          onChange={(v) => onSetDefault({ lineStroke: v })}
        />
        <Divider />
        <WidthPicker
          value={defaults.lineStrokeWidth}
          onChange={(w) => onSetDefault({ lineStrokeWidth: w })}
        />
      </>
    );
  } else {
    return null;
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-nd-border bg-nd-surface/95 px-3 py-2 shadow-xl backdrop-blur">
      {content}
    </div>
  );
});
