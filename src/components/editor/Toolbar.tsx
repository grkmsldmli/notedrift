"use client";

import { memo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Circle,
  Cloud,
  Database,
  Diamond,
  Eraser,
  FileText,
  Hexagon,
  Highlighter,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Paintbrush,
  Pen,
  Pencil,
  PenLine,
  PenTool,
  Pill,
  RectangleHorizontal,
  Shapes,
  Square,
  Star,
  StickyNote,
  Triangle,
  Type,
} from "lucide-react";
import type { Tool } from "@/lib/types";
import { IconButton } from "../ui/IconButton";

interface ToolbarProps {
  tool: Tool;
  onSelectTool: (tool: Tool) => void;
  onPickImage: () => void;
}

const ICON = 18;
const S = 17;

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

const BASIC_SHAPES: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: "rect", label: "Rectangle", icon: <Square size={S} /> },
  { tool: "roundrect", label: "Rounded rectangle", icon: <RectangleHorizontal size={S} /> },
  { tool: "ellipse", label: "Ellipse", icon: <Circle size={S} className="scale-x-125" /> },
  { tool: "circle", label: "Circle", icon: <Circle size={S} /> },
  { tool: "triangle", label: "Triangle", icon: <Triangle size={S} /> },
  { tool: "diamond", label: "Diamond", icon: <Diamond size={S} /> },
  { tool: "polygon", label: "Polygon", icon: <Hexagon size={S} /> },
  { tool: "star", label: "Star", icon: <Star size={S} /> },
  { tool: "cloud", label: "Cloud", icon: <Cloud size={S} /> },
];

const DIAGRAM_SHAPES: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: "terminator", label: "Start / End", icon: <Pill size={S} /> },
  { tool: "process", label: "Process", icon: <RectangleHorizontal size={S} /> },
  { tool: "decision", label: "Decision", icon: <Diamond size={S} /> },
  { tool: "database", label: "Database", icon: <Database size={S} /> },
  { tool: "document", label: "Document", icon: <FileText size={S} /> },
];

const ALL_SHAPES = [...BASIC_SHAPES, ...DIAGRAM_SHAPES];

const LINE_OPTIONS: { tool: Tool; label: string; hint: string; icon: React.ReactNode }[] = [
  { tool: "line", label: "Line", hint: "Straight", icon: <Minus size={ICON} /> },
  { tool: "arrow", label: "Arrow", hint: "One head", icon: <ArrowRight size={ICON} /> },
  {
    tool: "doublearrow",
    label: "Double arrow",
    hint: "Both heads",
    icon: <ArrowLeftRight size={ICON} />,
  },
];

const Divider = () => <div className="my-1 h-px w-6 bg-nd-border" />;

export const Toolbar = memo(function Toolbar({
  tool,
  onSelectTool,
  onPickImage,
}: ToolbarProps) {
  const [drawOpen, setDrawOpen] = useState(false);
  const [lastDraw, setLastDraw] = useState<Tool>("pen");
  const [shapeOpen, setShapeOpen] = useState(false);
  const [lastShape, setLastShape] = useState<Tool>("rect");
  const [lineOpen, setLineOpen] = useState(false);
  const [lastLine, setLastLine] = useState<Tool>("arrow");

  const drawActive = DRAW_OPTIONS.some((o) => o.tool === tool);
  if (drawActive && lastDraw !== tool) setLastDraw(tool);
  const drawIcon =
    DRAW_OPTIONS.find((o) => o.tool === (drawActive ? tool : lastDraw))?.icon ?? (
      <Pen size={ICON} />
    );

  const shapeActive = ALL_SHAPES.some((o) => o.tool === tool);
  if (shapeActive && lastShape !== tool) setLastShape(tool);
  const shapeIcon =
    ALL_SHAPES.find((o) => o.tool === (shapeActive ? tool : lastShape))?.icon ?? (
      <Shapes size={ICON} />
    );

  const lineActive = LINE_OPTIONS.some((o) => o.tool === tool);
  if (lineActive && lastLine !== tool) setLastLine(tool);
  const lineIcon =
    LINE_OPTIONS.find((o) => o.tool === (lineActive ? tool : lastLine))?.icon ?? (
      <ArrowRight size={ICON} />
    );

  const shapeGrid = (items: typeof BASIC_SHAPES) => (
    <div className="grid grid-cols-5 gap-1">
      {items.map((o) => (
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
  );

  const familyList = (
    items: typeof DRAW_OPTIONS,
    onPick: (t: Tool) => void,
  ) => (
    <div className="w-44">
      {items.map((o) => (
        <button
          key={o.tool}
          type="button"
          onClick={() => onPick(o.tool)}
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
              <div className="absolute left-full top-0 z-40 ml-2 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
                {familyList(DRAW_OPTIONS, (t) => {
                  setLastDraw(t);
                  onSelectTool(t);
                  setDrawOpen(false);
                })}
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

        {/* Shape library */}
        <div className="relative">
          <IconButton
            icon={shapeIcon}
            label="Shapes  (R)"
            active={shapeActive}
            onClick={() => {
              onSelectTool(shapeActive ? tool : lastShape);
              setShapeOpen((o) => !o);
            }}
          />
          {shapeOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShapeOpen(false)} />
              <div className="absolute left-full top-0 z-40 ml-2 w-56 rounded-xl border border-nd-border bg-nd-surface p-2 shadow-2xl">
                <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-nd-muted">
                  Basic
                </div>
                {shapeGrid(BASIC_SHAPES)}
                <div className="mb-1 mt-2 px-1 text-[10px] font-medium uppercase tracking-wide text-nd-muted">
                  Flowchart
                </div>
                {shapeGrid(DIAGRAM_SHAPES)}
              </div>
            </>
          )}
        </div>

        {/* Line family */}
        <div className="relative">
          <IconButton
            icon={lineIcon}
            label="Line  (L)"
            active={lineActive}
            onClick={() => {
              onSelectTool(lineActive ? tool : lastLine);
              setLineOpen((o) => !o);
            }}
          />
          {lineOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setLineOpen(false)} />
              <div className="absolute left-full top-0 z-40 ml-2 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
                {familyList(LINE_OPTIONS, (t) => {
                  setLastLine(t);
                  onSelectTool(t);
                  setLineOpen(false);
                })}
              </div>
            </>
          )}
        </div>

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
