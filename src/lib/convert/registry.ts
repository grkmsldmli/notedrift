// The single source of truth for every public converter. Routes, the /tools
// listing, SEO metadata, and "related tools" all derive from this list — no tool
// name/slug is duplicated by hand anywhere else.

import type { ToolCategory, ToolDef } from "./types";

const PNG = "image/png";
const JPG = "image/jpeg";
const WEBP = "image/webp";
const SVG = "image/svg+xml";

export const TOOLS: readonly ToolDef[] = [
  // ---- Image format ----
  {
    slug: "png-to-jpg",
    title: "PNG to JPG",
    seoTitle: "PNG to JPG Converter — Free & Private | NoteDrift",
    description:
      "Convert PNG images to JPG right in your browser. Free, no signup, files stay on your device.",
    category: "image-format",
    kind: "raster",
    accept: [PNG],
    acceptExts: ["png"],
    acceptLabel: "PNG",
    output: "jpeg",
    outputExt: "jpg",
    related: ["jpg-to-png", "image-compressor", "png-to-pdf"],
  },
  {
    slug: "jpg-to-png",
    title: "JPG to PNG",
    seoTitle: "JPG to PNG Converter — Free & Private | NoteDrift",
    description:
      "Convert JPG/JPEG images to PNG in your browser. Free, no upload, private by design.",
    category: "image-format",
    kind: "raster",
    accept: [JPG],
    acceptExts: ["jpg", "jpeg"],
    acceptLabel: "JPG",
    output: "png",
    outputExt: "png",
    related: ["png-to-jpg", "image-resizer", "jpg-to-pdf"],
  },
  {
    slug: "webp-to-jpg",
    title: "WebP to JPG",
    seoTitle: "WebP to JPG Converter — Free Browser Tool | NoteDrift",
    description:
      "Convert WebP images to JPG in your browser. Fast, free, and completely private.",
    category: "image-format",
    kind: "raster",
    accept: [WEBP],
    acceptExts: ["webp"],
    acceptLabel: "WebP",
    output: "jpeg",
    outputExt: "jpg",
    related: ["webp-to-png", "image-compressor", "png-to-jpg"],
  },
  {
    slug: "webp-to-png",
    title: "WebP to PNG",
    seoTitle: "WebP to PNG Converter — Free Browser Tool | NoteDrift",
    description:
      "Convert WebP images to PNG in your browser, keeping transparency. Free and private.",
    category: "image-format",
    kind: "raster",
    accept: [WEBP],
    acceptExts: ["webp"],
    acceptLabel: "WebP",
    output: "png",
    outputExt: "png",
    related: ["webp-to-jpg", "jpg-to-png", "image-resizer"],
  },
  {
    slug: "svg-to-png",
    title: "SVG to PNG",
    seoTitle: "SVG to PNG Converter — Free & Private | NoteDrift",
    description:
      "Render SVG vector files to PNG images in your browser. Choose the output size. Free and private.",
    category: "image-format",
    kind: "raster",
    accept: [SVG],
    acceptExts: ["svg"],
    acceptLabel: "SVG",
    output: "png",
    outputExt: "png",
    related: ["png-to-jpg", "image-resizer", "png-to-ico"],
  },

  // ---- Image utilities ----
  {
    slug: "image-compressor",
    title: "Compress Image",
    seoTitle: "Compress Image — Free Browser Image Compressor | NoteDrift",
    description:
      "Shrink JPG, PNG, and WebP images in your browser with a simple quality control. Free and private.",
    category: "image-utility",
    kind: "compress",
    accept: [JPG, PNG, WEBP],
    acceptExts: ["jpg", "jpeg", "png", "webp"],
    acceptLabel: "JPG, PNG or WebP",
    output: "jpeg",
    outputExt: "jpg",
    related: ["image-resizer", "png-to-jpg", "webp-to-jpg"],
  },
  {
    slug: "image-resizer",
    title: "Resize Image",
    seoTitle: "Resize Image — Free Browser Image Resizer | NoteDrift",
    description:
      "Resize JPG, PNG, and WebP images to exact dimensions in your browser. Keeps aspect ratio. Free and private.",
    category: "image-utility",
    kind: "resize",
    accept: [JPG, PNG, WEBP],
    acceptExts: ["jpg", "jpeg", "png", "webp"],
    acceptLabel: "JPG, PNG or WebP",
    output: "png",
    outputExt: "png",
    related: ["image-compressor", "png-to-jpg", "svg-to-png"],
  },

  // ---- PDF ----
  {
    slug: "jpg-to-pdf",
    title: "JPG to PDF",
    seoTitle: "JPG to PDF Converter — Free & Private | NoteDrift",
    description:
      "Turn one or more JPG images into a single PDF in your browser. One page per image. Free and private.",
    category: "pdf",
    kind: "images-to-pdf",
    accept: [JPG],
    acceptExts: ["jpg", "jpeg"],
    acceptLabel: "JPG",
    output: "pdf",
    outputExt: "pdf",
    related: ["png-to-pdf", "jpg-to-png", "image-compressor"],
  },
  {
    slug: "png-to-pdf",
    title: "PNG to PDF",
    seoTitle: "PNG to PDF Converter — Free & Private | NoteDrift",
    description:
      "Turn one or more PNG images into a single PDF in your browser. One page per image. Free and private.",
    category: "pdf",
    kind: "images-to-pdf",
    accept: [PNG],
    acceptExts: ["png"],
    acceptLabel: "PNG",
    output: "pdf",
    outputExt: "pdf",
    related: ["jpg-to-pdf", "png-to-jpg", "image-compressor"],
  },

  // ---- Favicon ----
  {
    slug: "png-to-ico",
    title: "PNG to ICO",
    seoTitle: "PNG to ICO Favicon Converter — Free & Private | NoteDrift",
    description:
      "Turn a PNG into a multi-size .ico favicon (16, 32, 48 px) in your browser. Free and private.",
    category: "favicon",
    kind: "png-to-ico",
    accept: [PNG],
    acceptExts: ["png"],
    acceptLabel: "PNG",
    output: "ico",
    outputExt: "ico",
    related: ["svg-to-png", "image-resizer", "png-to-jpg"],
  },
] as const;

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  "image-format": "Image format",
  "image-utility": "Image tools",
  pdf: "PDF",
  favicon: "Favicon",
};

/** Category display order for the /tools listing. */
export const CATEGORY_ORDER: readonly ToolCategory[] = [
  "image-format",
  "image-utility",
  "pdf",
  "favicon",
];

export function getTool(slug: string): ToolDef | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolsInCategory(category: ToolCategory): ToolDef[] {
  return TOOLS.filter((t) => t.category === category);
}

export function relatedTools(tool: ToolDef): ToolDef[] {
  return tool.related
    .map((s) => getTool(s))
    .filter((t): t is ToolDef => t !== undefined);
}
