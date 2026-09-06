"use client";

import { memo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Circle,
  Cloud,
  Database,
  Diamond,
  Eraser,
  FileText,
  Hand,
  Hexagon,
  Highlighter,
  Image as ImageIcon,
  LayoutGrid,
  Lasso,
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
  Spline,
  Square,
  Star,
  StickyNote,
  Triangle,
  Type,
} from "lucide-react";
import type { EraserMode, RailSlot, Tool } from "@/lib/types";
import { getToolDef } from "@/lib/tools/registry";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { IconButton } from "../ui/IconButton";
import { ToolLibrary } from "./ToolLibrary";

interface ToolbarProps {
  tool: Tool;
  pinnedSlots: RailSlot[];
  eraserMode: EraserMode;
  onSelectTool: (tool: Tool) => void;
  onPickImage: () => void;
  onSetEraserMode: (mode: EraserMode) => void;
  onTogglePin: (slot: RailSlot) => void;
}

const ICON = 18;
const S = 17;

/** On phones the rail becomes a compact bottom dock with a FIXED primary set —
 *  every other tool stays reachable through All Tools. Keeps the dock at ~6
 *  targets so it never overflows or scrolls on a 320px phone. */
const MOBILE_SLOTS: RailSlot[] = ["draw", "text", "shapes", "eraser"];

type Orient = "h" | "v";

/** Popover anchor: to the RIGHT of the desktop rail, or ABOVE the mobile dock.
 *  Capped in height and scrollable so it never runs off a short viewport. */
const POPOVER_POS: Record<Orient, string> = {
  v: "absolute left-full top-0 z-40 ml-2 max-h-[70vh] overflow-y-auto nd-scroll",
  h: "absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 max-h-[60vh] overflow-y-auto nd-scroll",
};

const DRAW_OPTIONS: { tool: Tool; label: string; hint: string; icon: React.ReactNode }[] = [
  { tool: "pen", label: "Pen", hint: "Smooth & crisp", icon: <Pen size={ICON} /> },
  { tool: "pencil", label: "Pencil", hint: "Soft sketch", icon: <Pencil size={ICON} /> },
  { tool: "marker", label: "Marker", hint: "Bold coverage", icon: <PenLine size={ICON} /> },
  { tool: "highlighter", label: "Highlighter", hint: "Translucent", icon: <Highlighter size={ICON} /> },
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
  { tool: "doublearrow", label: "Double arrow", hint: "Both heads", icon: <ArrowLeftRight size={ICON} /> },
];

const Divider = ({ h = false }: { h?: boolean }) =>
  h ? <div className="mx-0.5 h-6 w-px bg-nd-border" /> : <div className="my-1 h-px w-6 bg-nd-border" />;

export const Toolbar = memo(function Toolbar({
  tool,
  pinnedSlots,
  eraserMode,
  onSelectTool,
  onPickImage,
  onSetEraserMode,
  onTogglePin,
}: ToolbarProps) {
  const isMobile = useIsMobile();
  const orient: Orient = isMobile ? "h" : "v";
  const slots = isMobile ? MOBILE_SLOTS : pinnedSlots;

  const [openSlot, setOpenSlot] = useState<RailSlot | "library" | null>(null);
  const [lastDraw, setLastDraw] = useState<Tool>("pen");
  const [lastShape, setLastShape] = useState<Tool>("rect");
  const [lastLine, setLastLine] = useState<Tool>("arrow");

  const drawActive = DRAW_OPTIONS.some((o) => o.tool === tool);
  if (drawActive && lastDraw !== tool) setLastDraw(tool);
  const drawIcon =
    DRAW_OPTIONS.find((o) => o.tool === (drawActive ? tool : lastDraw))?.icon ?? <Pen size={ICON} />;

  const shapeActive = ALL_SHAPES.some((o) => o.tool === tool);
  if (shapeActive && lastShape !== tool) setLastShape(tool);
  const shapeIcon =
    ALL_SHAPES.find((o) => o.tool === (shapeActive ? tool : lastShape))?.icon ?? <Shapes size={ICON} />;

  const lineActive = LINE_OPTIONS.some((o) => o.tool === tool);
  if (lineActive && lastLine !== tool) setLastLine(tool);
  const lineIcon =
    LINE_OPTIONS.find((o) => o.tool === (lineActive ? tool : lastLine))?.icon ?? <ArrowRight size={ICON} />;

  const toggle = (slot: RailSlot | "library") =>
    setOpenSlot((o) => (o === slot ? null : slot));
  const close = () => setOpenSlot(null);

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
            close();
          }}
        />
      ))}
    </div>
  );

  const familyList = (items: typeof DRAW_OPTIONS, onPick: (t: Tool) => void) => (
    <div className="w-40">
      {items.map((o) => (
        <button
          key={o.tool}
          type="button"
          onClick={() => onPick(o.tool)}
          className={[
            "nd-hit flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
            tool === o.tool ? "bg-nd-accent/15 text-nd-text" : "hover:bg-white/5",
          ].join(" ")}
        >
          <span className={tool === o.tool ? "text-nd-accent" : "text-nd-muted"}>{o.icon}</span>
          <span className="flex flex-col">
            <span className="text-sm leading-tight text-nd-text">{o.label}</span>
            <span className="text-[11px] leading-tight text-nd-faint">{o.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );

  const familyPopover = (slot: RailSlot, body: React.ReactNode) =>
    openSlot === slot && (
      <>
        <div className="fixed inset-0 z-30" onClick={close} />
        <div className={`${POPOVER_POS[orient]} rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl`}>
          {body}
        </div>
      </>
    );

  const renderSlot = (slot: RailSlot): React.ReactNode => {
    switch (slot) {
      case "draw":
        return (
          <div key={slot} className="relative">
            <IconButton
              icon={drawIcon}
              label="Draw  (P)"
              active={drawActive}
              onClick={() => {
                onSelectTool(drawActive ? tool : lastDraw);
                toggle("draw");
              }}
            />
            {familyPopover(
              "draw",
              familyList(DRAW_OPTIONS, (t) => {
                setLastDraw(t);
                onSelectTool(t);
                close();
              }),
            )}
          </div>
        );
      case "text":
        return (
          <IconButton
            key={slot}
            icon={<Type size={ICON} />}
            label="Text  (T)"
            active={tool === "text"}
            onClick={() => onSelectTool("text")}
          />
        );
      case "shapes":
        return (
          <div key={slot} className="relative">
            <IconButton
              icon={shapeIcon}
              label="Shapes  (R)"
              active={shapeActive}
              onClick={() => {
                onSelectTool(shapeActive ? tool : lastShape);
                toggle("shapes");
              }}
            />
            {openSlot === "shapes" && (
              <>
                <div className="fixed inset-0 z-30" onClick={close} />
                <div className={`${POPOVER_POS[orient]} w-52 rounded-xl border border-nd-border bg-nd-surface p-1.5 shadow-2xl`}>
                  <div className="mb-0.5 px-1 text-[10px] font-medium uppercase tracking-wide text-nd-muted">
                    Basic
                  </div>
                  {shapeGrid(BASIC_SHAPES)}
                  <div className="mb-0.5 mt-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-nd-muted">
                    Flowchart
                  </div>
                  {shapeGrid(DIAGRAM_SHAPES)}
                </div>
              </>
            )}
          </div>
        );
      case "line":
        return (
          <div key={slot} className="relative">
            <IconButton
              icon={lineIcon}
              label="Line  (L)"
              active={lineActive}
              onClick={() => {
                onSelectTool(lineActive ? tool : lastLine);
                toggle("line");
              }}
            />
            {familyPopover(
              "line",
              familyList(LINE_OPTIONS, (t) => {
                setLastLine(t);
                onSelectTool(t);
                close();
              }),
            )}
          </div>
        );
      case "note":
        return (
          <IconButton
            key={slot}
            icon={<StickyNote size={ICON} />}
            label="Sticky note  (N)"
            active={tool === "note"}
            onClick={() => onSelectTool("note")}
          />
        );
      case "image":
        return (
          <IconButton
            key={slot}
            icon={<ImageIcon size={ICON} />}
            label={getToolDef("image")?.label ?? "Insert image"}
            onClick={onPickImage}
          />
        );
      case "lasso":
        return (
          <IconButton
            key={slot}
            icon={<Lasso size={ICON} />}
            label="Lasso select  (Q)"
            active={tool === "lasso"}
            onClick={() => onSelectTool("lasso")}
          />
        );
      case "hand":
        return (
          <IconButton
            key={slot}
            icon={<Hand size={ICON} />}
            label="Hand — pan  (H)"
            active={tool === "hand"}
            onClick={() => onSelectTool("hand")}
          />
        );
      case "eraser":
        return (
          <div key={slot} className="relative">
            <IconButton
              icon={<Eraser size={ICON} />}
              label="Eraser  (E)"
              active={tool === "eraser"}
              onClick={() => {
                onSelectTool("eraser");
                toggle("eraser");
              }}
            />
            {openSlot === "eraser" && (
              <>
                <div className="fixed inset-0 z-30" onClick={close} />
                <div className={`${POPOVER_POS[orient]} w-40 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl`}>
                  {(
                    [
                      { mode: "object", label: "Object", hint: "Erase whole objects", icon: <Boxes size={16} /> },
                      { mode: "stroke", label: "Stroke", hint: "Erase ink strokes", icon: <Spline size={16} /> },
                    ] as { mode: EraserMode; label: string; hint: string; icon: React.ReactNode }[]
                  ).map((o) => (
                    <button
                      key={o.mode}
                      type="button"
                      onClick={() => {
                        onSelectTool("eraser");
                        onSetEraserMode(o.mode);
                        close();
                      }}
                      className={[
                        "nd-hit flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                        eraserMode === o.mode ? "bg-nd-accent/15 text-nd-text" : "hover:bg-white/5",
                      ].join(" ")}
                    >
                      <span className={eraserMode === o.mode ? "text-nd-accent" : "text-nd-muted"}>
                        {o.icon}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-sm leading-tight text-nd-text">{o.label}</span>
                        <span className="text-[11px] leading-tight text-nd-faint">{o.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  // Outer wrapper is pointer-events-none so the transparent area around the pill
  // (full width at the bottom on mobile) never blocks the canvas; the pill itself
  // re-enables pointer events.
  const outer = isMobile
    ? "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]"
    : "pointer-events-none absolute left-4 top-1/2 z-20 flex max-h-[calc(100%-1.25rem)] -translate-y-1/2 flex-col";
  // No overflow/scroll on the pill itself: its flyout popovers open OUTSIDE it
  // (left-full on desktop, bottom-full on mobile), and an overflow container would
  // clip them. Item counts are bounded (fixed 6 on mobile; the rail only shows on
  // tall screens), so the pill always fits without scrolling.
  const pill = isMobile
    ? "nd-rail pointer-events-auto flex max-w-full items-center gap-0.5 rounded-2xl border border-nd-border bg-nd-surface/95 p-1 shadow-xl backdrop-blur"
    : "nd-rail pointer-events-auto flex min-h-0 flex-col items-center gap-0.5 rounded-2xl border border-nd-border bg-nd-surface/95 p-1 shadow-xl backdrop-blur";

  return (
    <div className={outer}>
      <div className={pill}>
        <IconButton
          icon={<MousePointer2 size={ICON} />}
          label="Select  (V)"
          active={tool === "select"}
          onClick={() => onSelectTool("select")}
        />
        <Divider h={isMobile} />
        {slots.map(renderSlot)}
        <Divider h={isMobile} />
        {/* Tool Library — the unified discovery + pinning path (All Tools). */}
        <div className="relative">
          <IconButton
            icon={<LayoutGrid size={ICON} />}
            label="All tools"
            active={openSlot === "library"}
            onClick={() => toggle("library")}
          />
          {openSlot === "library" && (
            <ToolLibrary
              orient={orient}
              tool={tool}
              pinnedSlots={pinnedSlots}
              onSelectTool={(t) => {
                onSelectTool(t);
              }}
              onPickImage={onPickImage}
              onTogglePin={onTogglePin}
              onClose={close}
            />
          )}
        </div>
      </div>
    </div>
  );
});
