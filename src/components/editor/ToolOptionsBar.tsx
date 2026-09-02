"use client";

import { memo } from "react";
import { PenTool } from "lucide-react";
import { PALETTE, SHAPE_FILLS } from "@/lib/constants";
import type { PenStabilization, Tool, ToolDefaults } from "@/lib/types";
import { Divider, Label, Segmented, SwatchRow, WidthPicker } from "../ui/controls";

const STABILIZE: { value: string; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

interface ToolOptionsBarProps {
  tool: Tool;
  defaults: ToolDefaults;
  onSetDefault: (patch: Partial<ToolDefaults>) => void;
}

const DRAWING_TOOLS: Tool[] = ["pen", "rect", "ellipse", "line", "arrow"];

export const ToolOptionsBar = memo(function ToolOptionsBar({
  tool,
  defaults,
  onSetDefault,
}: ToolOptionsBarProps) {
  if (!DRAWING_TOOLS.includes(tool)) return null;

  let content: React.ReactNode = null;

  if (tool === "pen") {
    content = (
      <>
        <Label>Pen</Label>
        <SwatchRow
          options={PALETTE}
          value={defaults.penColor}
          onChange={(v) => onSetDefault({ penColor: v })}
        />
        <Divider />
        <WidthPicker
          value={defaults.penWidth}
          onChange={(w) => onSetDefault({ penWidth: w })}
        />
        <Divider />
        <Label>Smooth</Label>
        <Segmented
          options={STABILIZE}
          value={defaults.penStabilization}
          onChange={(v) => onSetDefault({ penStabilization: v as PenStabilization })}
        />
        <Divider />
        <button
          type="button"
          title="Pressure-aware width (stylus)"
          aria-pressed={defaults.penPressure}
          onClick={() => onSetDefault({ penPressure: !defaults.penPressure })}
          className={[
            "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
            defaults.penPressure
              ? "bg-nd-accent/15 text-nd-text ring-1 ring-nd-accent/40"
              : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
          ].join(" ")}
        >
          <PenTool size={14} />
          Pressure
        </button>
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
  } else {
    // line / arrow
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
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border border-nd-border bg-nd-surface/95 px-3 py-2 shadow-xl backdrop-blur">
      {content}
    </div>
  );
});
