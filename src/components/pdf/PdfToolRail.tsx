"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Brush,
  Circle,
  Eraser,
  Highlighter,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Pencil,
  RectangleHorizontal,
  Signature,
  Square,
  Type,
} from "lucide-react";
import type { PdfTool } from "@/lib/pdf/overlayController";

const SHAPE_TOOLS: PdfTool[] = ["rect", "ellipse", "line"];

const BTN =
  "nd-hit flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors";
const active = "bg-nd-accent/20 text-nd-accent";
const idle = "text-nd-muted hover:bg-white/5 hover:text-nd-text";

export function PdfToolRail({
  tool,
  onTool,
}: {
  tool: PdfTool;
  onTool: (t: PdfTool) => void;
}) {
  const [shapesOpen, setShapesOpen] = useState(false);
  const shapeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shapesOpen) return;
    function onDoc(e: MouseEvent) {
      if (!shapeRef.current?.contains(e.target as Node)) setShapesOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [shapesOpen]);

  const shapeActive = SHAPE_TOOLS.includes(tool);
  const ShapeIcon = tool === "ellipse" ? Circle : tool === "line" ? Minus : Square;

  return (
    <div
      className="nd-hidescroll pointer-events-auto absolute left-1/2 bottom-[4.5rem] z-20 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-row items-center gap-0.5 overflow-x-auto rounded-xl border border-nd-border bg-nd-surface/95 p-1 shadow-xl shadow-black/40 backdrop-blur md:left-3 md:top-1/2 md:bottom-auto md:max-w-none md:-translate-x-0 md:-translate-y-1/2 md:flex-col md:overflow-visible"
      role="toolbar"
      aria-label="PDF tools"
    >
      <ToolButton label="Select  (V)" isActive={tool === "select"} onClick={() => onTool("select")}>
        <MousePointer2 size={17} />
      </ToolButton>
      <ToolButton label="Text  (T)" isActive={tool === "text"} onClick={() => onTool("text")}>
        <Type size={17} />
      </ToolButton>
      <ToolButton label="Pen  (P)" isActive={tool === "pen"} onClick={() => onTool("pen")}>
        <Pencil size={17} />
      </ToolButton>
      <ToolButton label="Brush — opaque paint / cover  (B)" isActive={tool === "brush"} onClick={() => onTool("brush")}>
        <Brush size={17} />
      </ToolButton>
      <ToolButton label="Eraser — remove your overlays  (E)" isActive={tool === "eraser"} onClick={() => onTool("eraser")}>
        <Eraser size={17} />
      </ToolButton>
      <ToolButton label="Highlight  (H)" isActive={tool === "highlight"} onClick={() => onTool("highlight")}>
        <Highlighter size={17} />
      </ToolButton>

      <div ref={shapeRef} className="relative flex shrink-0">
        <button
          type="button"
          aria-label="Shapes"
          aria-pressed={shapeActive}
          aria-expanded={shapesOpen}
          onClick={() => setShapesOpen((o) => !o)}
          className={`${BTN} ${shapeActive ? active : idle}`}
        >
          <ShapeIcon size={17} />
        </button>
        {shapesOpen && (
          <div className="absolute bottom-full left-1/2 z-30 mb-1 flex -translate-x-1/2 flex-row gap-0.5 rounded-lg border border-nd-border bg-nd-surface p-1 shadow-xl md:bottom-auto md:left-full md:top-1/2 md:mb-0 md:ml-1 md:-translate-x-0 md:-translate-y-1/2 md:flex-col">
            <ToolButton label="Rectangle" isActive={tool === "rect"} onClick={() => { onTool("rect"); setShapesOpen(false); }}>
              <Square size={17} />
            </ToolButton>
            <ToolButton label="Ellipse" isActive={tool === "ellipse"} onClick={() => { onTool("ellipse"); setShapesOpen(false); }}>
              <Circle size={17} />
            </ToolButton>
            <ToolButton label="Line" isActive={tool === "line"} onClick={() => { onTool("line"); setShapesOpen(false); }}>
              <Minus size={17} />
            </ToolButton>
          </div>
        )}
      </div>

      <ToolButton label="Arrow" isActive={tool === "arrow"} onClick={() => onTool("arrow")}>
        <ArrowUpRight size={17} />
      </ToolButton>

      <span className="mx-0.5 my-0.5 h-px w-5 shrink-0 bg-nd-border md:h-5 md:w-px" />

      <ToolButton label="Image" isActive={false} onClick={() => onTool("image")}>
        <ImageIcon size={17} />
      </ToolButton>
      <ToolButton label="Whiteout / Cover" isActive={tool === "whiteout"} onClick={() => onTool("whiteout")}>
        <RectangleHorizontal size={17} />
      </ToolButton>
      <ToolButton label="Signature" isActive={false} onClick={() => onTool("signature")}>
        <Signature size={17} />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  isActive,
  onClick,
  children,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={isActive}
      onClick={onClick}
      className={`${BTN} ${isActive ? active : idle}`}
    >
      {children}
    </button>
  );
}
