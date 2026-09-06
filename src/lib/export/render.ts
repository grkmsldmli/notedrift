"use client";

// Off-screen rendering of a saved CanvasDoc to a PNG — used to build a multi-page
// PDF from every local page without disturbing the live editor. Uses a throwaway
// Fabric StaticCanvas; custom NoteDrift object classes are already registered in
// the bundle (the live controller imports them), so loadFromJSON reconstructs
// sticky notes / mind-map nodes / connectors correctly. Always disposes the
// canvas and its DOM element.

import * as fabric from "fabric";
import type { CanvasDoc } from "@/lib/types";
import { ensureCanvasFonts } from "@/lib/fonts";
import { outputPixels, resolveScale } from "./scale";
import { dataUrlToBlob } from "./download";

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boundsOf(objects: fabric.FabricObject[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objects) {
    o.setCoords();
    const c = o.aCoords;
    if (!c) continue;
    for (const p of [c.tl, c.tr, c.bl, c.br]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

export interface RenderedPage {
  blob: Blob;
  width: number;
  height: number;
}

/** Render one saved page document to a PNG. Empty pages become a blank white page
 *  (tolerated in a multi-page PDF). Returns null on failure. */
export async function renderDocToPng(
  doc: CanvasDoc,
  opts: { scale?: number; background: "white" | "transparent"; padding?: number },
): Promise<RenderedPage | null> {
  const el = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(el, { enableRetinaScaling: false, renderOnAddRemove: false });
  try {
    await ensureCanvasFonts();
    await canvas.loadFromJSON(doc);
    const objects = canvas.getObjects();
    const pad = opts.padding ?? 48;

    let left = 0;
    let top = 0;
    let rawW = 1200;
    let rawH = 800;
    const b = objects.length > 0 ? boundsOf(objects) : null;
    if (b) {
      left = b.left - pad;
      top = b.top - pad;
      rawW = b.width + pad * 2;
      rawH = b.height + pad * 2;
    }

    const scale = resolveScale(rawW, rawH, {
      scope: "canvas",
      background: opts.background,
      scale: opts.scale ?? 2,
    });
    const { width, height } = outputPixels(rawW, rawH, scale);

    canvas.setDimensions({ width, height });
    canvas.setViewportTransform([scale, 0, 0, scale, -left * scale, -top * scale]);
    canvas.backgroundColor = opts.background === "white" ? "#ffffff" : "";
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1, enableRetinaScaling: false });
    return { blob: dataUrlToBlob(dataUrl), width, height };
  } catch {
    return null;
  } finally {
    canvas.dispose();
    el.width = 0;
    el.height = 0;
  }
}
