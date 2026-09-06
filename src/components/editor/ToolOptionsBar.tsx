"use client";

import { memo, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, PenTool } from "lucide-react";
import { OUTLINE_WIDTHS } from "@/lib/constants";
import { DRAW_TOOLS, materialFor } from "@/lib/brush/materials";
import { SHAPE_IDS, shapeDef } from "@/lib/shapes/registry";
import type {
  DashStyle,
  DrawTool,
  DrawToolPrefs,
  PenStabilization,
  Tool,
  ToolDefaults,
} from "@/lib/types";
import { Divider, Label, Segmented, SwatchRow } from "../ui/controls";
import { ColorPopover } from "../ui/ColorPopover";
import { OpacityControl, WidthControl } from "../ui/BrushControls";
import { DashPicker, Stepper } from "../ui/ShapeControls";
import { FontPicker } from "../ui/TextControls";
import { FONT_STACKS, fontKeyOf } from "@/lib/fonts";
import { NOTE_COLORS } from "@/lib/constants";

interface ToolOptionsBarProps {
  tool: Tool;
  defaults: ToolDefaults;
  onSetDefault: (patch: Partial<ToolDefaults>, commit?: boolean) => void;
  onSetDrawPref: (patch: Partial<DrawToolPrefs>, commit?: boolean) => void;
}

const DRAW_SET = new Set<Tool>(DRAW_TOOLS);
const SHAPE_SET = new Set<Tool>(SHAPE_IDS as Tool[]);
const LINE_SET = new Set<Tool>(["line", "arrow", "doublearrow"]);

const STABILIZE: { value: string; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

const LINE_LABEL: Record<string, string> = {
  line: "Line",
  arrow: "Arrow",
  doublearrow: "Double arrow",
};

/** The compact summary shown while the settings panel is collapsed: a color dot
 *  plus the tool's key numbers. Mirrors the active branch's controls. */
function summaryFor(
  tool: Tool,
  defaults: ToolDefaults,
): { color: string; chips: string[]; label: string } | null {
  if (DRAW_SET.has(tool)) {
    const d = tool as DrawTool;
    const mat = materialFor(d);
    const p = defaults.draw[d];
    return {
      color: p.color,
      label: mat.label,
      chips: [`${p.width}`, ...(mat.showOpacity ? [`${Math.round(p.opacity * 100)}%`] : [])],
    };
  }
  if (SHAPE_SET.has(tool)) {
    return { color: defaults.shapeStroke, label: shapeDef(tool)?.label ?? "Shape", chips: [`${defaults.shapeStrokeWidth}`] };
  }
  if (LINE_SET.has(tool)) {
    return { color: defaults.lineStroke, label: LINE_LABEL[tool] ?? "Line", chips: [`${defaults.lineStrokeWidth}`] };
  }
  if (tool === "text") return { color: defaults.textColor, label: "Text", chips: [`${defaults.textFontSize}`] };
  if (tool === "note") return { color: defaults.noteFill, label: "Sticky note", chips: [] };
  return null;
}

export const ToolOptionsBar = memo(function ToolOptionsBar({
  tool,
  defaults,
  onSetDefault,
  onSetDrawPref,
}: ToolOptionsBarProps) {
  // Canvas-first: the panel starts COLLAPSED (a compact pill) so the tool is
  // usable immediately without a big card covering the canvas. The parent keys
  // this component by tool, so switching tools resets it to collapsed.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  let content: React.ReactNode = null;

  if (DRAW_SET.has(tool)) {
    const draw = tool as DrawTool;
    const mat = materialFor(draw);
    const p = defaults.draw[draw];
    content = (
      <>
        <Label>{mat.label}</Label>
        <ColorPopover value={p.color} onChange={(c, commit) => onSetDrawPref({ color: c }, commit)} />
        <Divider />
        <WidthControl value={p.width} onChange={(w, commit) => onSetDrawPref({ width: w }, commit)} />
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
              title={draw === "brush" ? "Velocity/pressure dynamics" : "Pressure-aware width (stylus)"}
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
  } else if (SHAPE_SET.has(tool)) {
    const def = shapeDef(tool);
    content = (
      <>
        <Label>{def?.label ?? "Shape"}</Label>
        <ColorPopover
          value={defaults.shapeStroke}
          onChange={(c, commit) => onSetDefault({ shapeStroke: c }, commit)}
        />
        <Divider />
        <Label>Fill</Label>
        <ColorPopover
          value={defaults.shapeFill}
          allowNone
          onChange={(c, commit) => onSetDefault({ shapeFill: c }, commit)}
        />
        <Divider />
        <WidthControl
          value={defaults.shapeStrokeWidth}
          presets={OUTLINE_WIDTHS}
          min={1}
          max={20}
          onChange={(w, commit) => onSetDefault({ shapeStrokeWidth: w }, commit)}
        />
        <Divider />
        <DashPicker
          value={defaults.shapeDash}
          onChange={(d) => onSetDefault({ shapeDash: d as DashStyle })}
        />
        <Divider />
        <OpacityControl
          value={defaults.shapeOpacity}
          onChange={(o, commit) => onSetDefault({ shapeOpacity: o }, commit)}
        />
        {def?.radius && (
          <>
            <Divider />
            <Label>Radius</Label>
            <Stepper
              value={defaults.shapeRadius}
              min={0}
              max={64}
              step={4}
              onChange={(v) => onSetDefault({ shapeRadius: v })}
            />
          </>
        )}
        {def?.sides && (
          <>
            <Divider />
            <Label>Sides</Label>
            <Stepper
              value={defaults.shapeSides}
              min={3}
              max={12}
              onChange={(v) => onSetDefault({ shapeSides: v })}
            />
          </>
        )}
        {def?.star && (
          <>
            <Divider />
            <Label>Points</Label>
            <Stepper
              value={defaults.shapeStarPoints}
              min={3}
              max={12}
              onChange={(v) => onSetDefault({ shapeStarPoints: v })}
            />
          </>
        )}
      </>
    );
  } else if (LINE_SET.has(tool)) {
    content = (
      <>
        <Label>{LINE_LABEL[tool] ?? "Line"}</Label>
        <ColorPopover
          value={defaults.lineStroke}
          onChange={(c, commit) => onSetDefault({ lineStroke: c }, commit)}
        />
        <Divider />
        <WidthControl
          value={defaults.lineStrokeWidth}
          presets={OUTLINE_WIDTHS}
          min={1}
          max={20}
          onChange={(w, commit) => onSetDefault({ lineStrokeWidth: w }, commit)}
        />
        <Divider />
        <DashPicker
          value={defaults.lineDash}
          onChange={(d) => onSetDefault({ lineDash: d as DashStyle })}
        />
        <Divider />
        <OpacityControl
          value={defaults.lineOpacity}
          onChange={(o, commit) => onSetDefault({ lineOpacity: o }, commit)}
        />
      </>
    );
  } else if (tool === "text") {
    content = (
      <>
        <Label>Text</Label>
        <ColorPopover
          value={defaults.textColor}
          onChange={(c, commit) => onSetDefault({ textColor: c }, commit)}
        />
        <Divider />
        <FontPicker
          value={fontKeyOf(defaults.textFontFamily)}
          onChange={(k) => onSetDefault({ textFontFamily: FONT_STACKS[k] })}
        />
        <Divider />
        <Label>Size</Label>
        <Stepper
          value={defaults.textFontSize}
          min={10}
          max={160}
          step={2}
          onChange={(v) => onSetDefault({ textFontSize: v })}
        />
      </>
    );
  } else if (tool === "note") {
    content = (
      <>
        <Label>Sticky note</Label>
        <SwatchRow
          options={NOTE_COLORS}
          value={defaults.noteFill}
          onChange={(v) => onSetDefault({ noteFill: v })}
        />
      </>
    );
  } else {
    return null;
  }

  const summary = summaryFor(tool, defaults);

  // Collapsed: a small pill with a color dot + key numbers. Draw immediately.
  if (!expanded && summary) {
    return (
      <div className="pointer-events-auto absolute left-1/2 top-4 z-20 -translate-x-1/2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={`${summary.label} settings`}
          title={`${summary.label} settings`}
          className="flex items-center gap-2 rounded-xl border border-nd-border bg-nd-surface/95 px-2.5 py-1.5 shadow-xl backdrop-blur transition-colors hover:bg-nd-surface"
        >
          <span
            className="h-4 w-4 shrink-0 rounded-full border border-white/25"
            style={{ background: summary.color }}
          />
          {summary.chips.map((c) => (
            <span key={c} className="text-xs font-medium tabular-nums text-nd-muted">
              {c}
            </span>
          ))}
          <ChevronDown size={14} className="text-nd-muted" />
        </button>
      </div>
    );
  }

  // Expanded: the full settings, with a clear collapse control (Escape also works).
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-20 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-xl border border-nd-border bg-nd-surface/95 px-3 py-2 shadow-xl backdrop-blur">
      {content}
      <Divider />
      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-label="Collapse settings"
        title="Collapse"
        className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <ChevronUp size={15} />
      </button>
    </div>
  );
});
