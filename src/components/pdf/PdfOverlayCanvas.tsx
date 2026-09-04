"use client";

import { useEffect, useRef } from "react";
import {
  PdfOverlayController,
  type PdfSelection,
  type PdfTool,
  type PdfToolStyle,
} from "@/lib/pdf/overlayController";

/** The interactive editing layer, stacked exactly over the rendered PDF page.
 *  It owns a dedicated Fabric controller for the whole document (all pages'
 *  overlays + undo history live in the controller, which persists as long as
 *  this component is mounted — keyed by document upstream so a new PDF gets a
 *  fresh controller). */
export function PdfOverlayCanvas({
  pageId,
  display,
  scale,
  tool,
  toolStyle,
  onController,
  onHistory,
  onSelection,
  onToolReset,
}: {
  pageId: string;
  display: { width: number; height: number };
  scale: number;
  tool: PdfTool;
  toolStyle: PdfToolStyle;
  onController: (c: PdfOverlayController | null) => void;
  onHistory: (s: { canUndo: boolean; canRedo: boolean; count: number }) => void;
  onSelection: (s: PdfSelection | null) => void;
  onToolReset: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<PdfOverlayController | null>(null);
  const prevPageRef = useRef<string | null>(null);
  const prevDisplayRef = useRef<{ width: number; height: number } | null>(null);

  // Latest callbacks without re-creating the controller.
  const cbRef = useRef({ onHistory, onSelection, onToolReset });
  useEffect(() => {
    cbRef.current = { onHistory, onSelection, onToolReset };
  });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const controller = new PdfOverlayController(el, {
      onHistory: (s) => cbRef.current.onHistory(s),
      onSelection: (s) => cbRef.current.onSelection(s),
      onToolReset: () => cbRef.current.onToolReset(),
    });
    controllerRef.current = controller;
    onController(controller);
    prevPageRef.current = null;
    prevDisplayRef.current = null;
    return () => {
      controller.dispose();
      controllerRef.current = null;
      onController(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Page / display / zoom sync. A page or size change rebuilds objects; a pure
  // zoom change only updates the viewport transform (no rebuild → invariance).
  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    const prevDisplay = prevDisplayRef.current;
    const displayChanged =
      !prevDisplay || prevDisplay.width !== display.width || prevDisplay.height !== display.height;
    if (prevPageRef.current !== pageId || displayChanged) {
      c.setPage(pageId, display, scale);
    } else {
      c.setScale(scale);
    }
    prevPageRef.current = pageId;
    prevDisplayRef.current = display;
  }, [pageId, display, scale]);

  useEffect(() => {
    controllerRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    controllerRef.current?.setToolStyle(toolStyle);
  }, [toolStyle]);

  return <canvas ref={canvasRef} />;
}
