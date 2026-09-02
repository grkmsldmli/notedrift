"use client";

import { memo, useState } from "react";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Highlighter,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Paintbrush,
  Pen,
  Pencil,
  PenLine,
  PenTool,
  Square,
  StickyNote,
  Type,
} from "lucide-react";
import type { Tool } from "@/lib/types";
import { SHAPE_TOOLS } from "@/lib/types";
import { IconButton } from "../ui/IconButton";

interface ToolbarProps {
  tool: Tool;
  onSelectTool: (tool: Tool) => void;
  onPickImage: () => void;
}

const ICON = 18;

const SHAPE_OPTIONS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: "rect", label: "Rectangle", icon: <Square size={ICON} /> },
  { tool: "ellipse", label: "Ellipse", icon: <Circle size={ICON} /> },
  { tool: "line", label: "Line", icon: <Minus size={ICON} /> },
];

const DRAW_OPTIONS: { tool: Tool; label: string; hint: string; icon: React.ReactNode }[] = [
  { tool: "pen", label: "Pen", hint: "Smooth & crisp", icon: <Pen size={ICON} /> },
  { tool: "pencil", label: "Pencil", hint: "Soft sketch", icon: <Pencil size={ICON} /> },
  { tool: "marker", label: "Marker", hint: "Bold coverage", icon: <PenLine size={ICON} /> },
  {
    tool: "highlighter",
    label: "Highlighter",
    hint: "Translucent",
    icon: <Highlighter size={ICON} />,
  },
  { tool: "brush", label: "Brush", hint: "Expressive", icon: <Paintbrush size={ICON} /> },
  { tool: "technical", label: "Technical", hint: "Precise", icon: <PenTool size={ICON} /> },
];

const Divider = () => <div className="my-1 h-px w-6 bg-nd-border" />;

export const Toolbar = memo(function Toolbar({
  tool,
  onSelectTool,
  onPickImage,
}: ToolbarProps) {
  const [shapeOpen, setShapeOpen] = useState(false);
  const [lastShape, setLastShape] = useState<Tool>("rect");
  const [drawOpen, setDrawOpen] = useState(false);
  const [lastDraw, setLastDraw] = useState<Tool>("pen");

  const shapeActive = SHAPE_TOOLS.includes(tool);
  const shapeIcon =
    SHAPE_OPTIONS.find((o) => o.tool === lastShape)?.icon ?? <Square size={ICON} />;

  const drawActive = DRAW_OPTIONS.some((o) => o.tool === tool);
  // Remember the active drawing tool so its icon shows on the rail (in-render
  // adjust — no effect).
  if (drawActive && lastDraw !== tool) setLastDraw(tool);
  const drawIcon =
    DRAW_OPTIONS.find((o) => o.tool === (drawActive ? tool : lastDraw))?.icon ?? (
      <Pen size={ICON} />
    );

  return (
    <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2">
      <div className="flex flex-col items-center gap-1 rounded-2xl border border-nd-border bg-nd-surface/95 p-1.5 shadow-xl backdrop-blur">
        <IconButton
          icon={<MousePointer2 size={ICON} />}
          label="Select  (V)"
          active={tool === "select"}
          onClick={() => onSelectTool("select")}
        />

        <Divider />

        {/* Drawing family */}
        <div className="relative">
          <IconButton
            icon={drawIcon}
            label="Draw  (P)"
            active={drawActive}
            onClick={() => {
              onSelectTool(drawActive ? tool : lastDraw);
              setDrawOpen((o) => !o);
            }}
          />
          {drawOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setDrawOpen(false)} />
              <div className="absolute left-full top-0 z-40 ml-2 w-44 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
                {DRAW_OPTIONS.map((o) => (
                  <button
                    key={o.tool}
                    type="button"
                    onClick={() => {
                      setLastDraw(o.tool);
                      onSelectTool(o.tool);
                      setDrawOpen(false);
                    }}
                    className={[
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                      tool === o.tool ? "bg-nd-accent/15 text-nd-text" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    <span className={tool === o.tool ? "text-nd-accent" : "text-nd-muted"}>
                      {o.icon}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm text-nd-text">{o.label}</span>
                      <span className="text-[10px] text-nd-faint">{o.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <IconButton
          icon={<Type size={ICON} />}
          label="Text  (T)"
          active={tool === "text"}
          onClick={() => onSelectTool("text")}
        />

        <div className="relative">
          <IconButton
            icon={shapeIcon}
            label="Shape  (R / O / L)"
            active={shapeActive}
            onClick={() => {
              onSelectTool(lastShape);
              setShapeOpen((o) => !o);
            }}
          />
          {shapeOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShapeOpen(false)}
              />
              <div className="absolute left-full top-0 z-40 ml-2 flex gap-1 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
                {SHAPE_OPTIONS.map((o) => (
                  <IconButton
                    key={o.tool}
                    icon={o.icon}
                    label={o.label}
                    active={tool === o.tool}
                    onClick={() => {
                      setLastShape(o.tool);
                      onSelectTool(o.tool);
                      setShapeOpen(false);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <IconButton
          icon={<ArrowUpRight size={ICON} />}
          label="Arrow  (A)"
          active={tool === "arrow"}
          onClick={() => onSelectTool("arrow")}
        />
        <IconButton
          icon={<StickyNote size={ICON} />}
          label="Sticky note  (N)"
          active={tool === "note"}
          onClick={() => onSelectTool("note")}
        />
        <IconButton
          icon={<ImageIcon size={ICON} />}
          label="Insert image"
          onClick={onPickImage}
        />

        <Divider />

        <IconButton
          icon={<Eraser size={ICON} />}
          label="Eraser  (E)"
          active={tool === "eraser"}
          onClick={() => onSelectTool("eraser")}
        />
      </div>
    </div>
  );
});
