// Shared export types. Kept free of Fabric/DOM so the pure sizing math (scale.ts)
// and the entitlement mapping are testable in node.

export type ExportScope = "canvas" | "selection";
export type ExportBackground = "white" | "transparent";

/** A raster (PNG) render request. Exactly one sizing mode is used, in priority
 *  order: explicit width/height (custom) → targetLongEdge → scale. */
export interface RasterRequest {
  scope: ExportScope;
  background: ExportBackground;
  /** Multiplier over the content's CSS size (Standard = 2). */
  scale?: number;
  /** Target pixels on the longest edge (HD/4K). */
  targetLongEdge?: number;
  /** Explicit output pixels (Custom size). */
  targetWidth?: number;
  targetHeight?: number;
  /** Scene padding around content, in canvas units. */
  padding?: number;
}

export interface RasterResult {
  blob: Blob;
  width: number;
  height: number;
}

/** Every export the menu can offer. Free: png-standard, pdf-standard. Rest Pro. */
export type ExportKind =
  | "png-standard"
  | "pdf-standard"
  | "png-hd"
  | "png-4k"
  | "png-transparent"
  | "png-selection"
  | "svg"
  | "custom"
  | "pdf-multi";

import type { BooleanCapability } from "@/lib/plans";

/** The entitlement each export requires. Free exports map to a capability every
 *  plan has (standardPNG/standardPDF); Pro exports to a Pro-only capability. The
 *  UI gates with can(plan, capability) — never a scattered plan === "pro". */
export const EXPORT_CAPABILITY: Record<ExportKind, BooleanCapability> = {
  "png-standard": "standardPNG",
  "pdf-standard": "standardPDF",
  "png-hd": "hdPNG",
  "png-4k": "hdPNG",
  "png-transparent": "transparentPNG",
  "png-selection": "selectionExport",
  svg: "svgExport",
  custom: "customExportSize",
  "pdf-multi": "multiPagePDF",
};

/** Conversion context passed to the upgrade sheet — steers only its opening line. */
export type UpgradeContext =
  | "general"
  | "cloud-limit"
  | "hd-export"
  | "transparent-export"
  | "svg-export"
  | "selection-export"
  | "multi-page-pdf"
  | "custom-size";

/** Which upgrade context a locked export opens. */
export const KIND_UPGRADE_CONTEXT: Record<ExportKind, UpgradeContext> = {
  "png-standard": "general",
  "pdf-standard": "general",
  "png-hd": "hd-export",
  "png-4k": "hd-export",
  "png-transparent": "transparent-export",
  "png-selection": "selection-export",
  svg: "svg-export",
  custom: "custom-size",
  "pdf-multi": "multi-page-pdf",
};

/** Display metadata for the Export menu, in order. `pro` items show a lock for
 *  Free users and open the contextual upgrade sheet instead of exporting. */
export const EXPORT_MENU: { kind: ExportKind; label: string; hint?: string; pro: boolean }[] = [
  { kind: "png-standard", label: "PNG", hint: "Standard image", pro: false },
  { kind: "pdf-standard", label: "PDF", hint: "This page", pro: false },
  { kind: "png-hd", label: "HD PNG", hint: "2560px", pro: true },
  { kind: "png-4k", label: "4K PNG", hint: "3840px", pro: true },
  { kind: "png-transparent", label: "Transparent PNG", hint: "No background", pro: true },
  { kind: "png-selection", label: "Export selection", hint: "Selected only", pro: true },
  { kind: "svg", label: "SVG", hint: "Scalable vector", pro: true },
  { kind: "custom", label: "Custom size…", hint: "Choose dimensions", pro: true },
  { kind: "pdf-multi", label: "Multi-page PDF", hint: "All pages", pro: true },
];

/** One resolved menu row for the UI (locked computed from the viewer's plan). */
export interface ExportItem {
  kind: ExportKind;
  label: string;
  hint?: string;
  pro: boolean;
  locked: boolean;
  /** For "png-selection": disabled when nothing is selected. */
  disabled?: boolean;
}
