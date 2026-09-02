"use client";

import { memo } from "react";
import { PALETTE, SHAPE_FILLS } from "@/lib/constants";
import type { Tool, ToolDefaults } from "@/lib/types";
import { Divider, Label, SwatchRow, WidthPicker } from "../ui/controls";

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
