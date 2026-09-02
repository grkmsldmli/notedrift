"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Pen,
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

const Divider = () => <div className="my-1 h-px w-6 bg-nd-border" />;

export function Toolbar({ tool, onSelectTool, onPickImage }: ToolbarProps) {
  const [shapeOpen, setShapeOpen] = useState(false);
  const [lastShape, setLastShape] = useState<Tool>("rect");

  const shapeActive = SHAPE_TOOLS.includes(tool);
  const shapeIcon =
    SHAPE_OPTIONS.find((o) => o.tool === lastShape)?.icon ?? <Square size={ICON} />;

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

        <IconButton
          icon={<Pen size={ICON} />}
          label="Pen  (P)"
          active={tool === "pen"}
          onClick={() => onSelectTool("pen")}
        />
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
}
