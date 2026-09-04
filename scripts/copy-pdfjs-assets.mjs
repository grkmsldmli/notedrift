// Copies the self-hosted PDF.js runtime assets from node_modules into
// public/pdfjs/ so the PDF editor can load them locally (no CDN, no reliance on
// a developer remembering to copy files). Non-destructive: it only creates/
// overwrites the four known targets, never deletes anything. Wired into
// postinstall / predev / prebuild. Skips quietly if pdfjs-dist isn't installed.

import { access, cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

const ITEMS = [
  ["build/pdf.min.mjs", "pdf.min.mjs"],
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(src))) {
  console.warn("[copy-pdfjs-assets] pdfjs-dist not installed — skipping.");
  process.exit(0);
}

await mkdir(dest, { recursive: true });
for (const [from, to] of ITEMS) {
  const fromPath = join(src, from);
  if (!(await exists(fromPath))) {
    console.warn(`[copy-pdfjs-assets] missing ${from} — skipping.`);
    continue;
  }
  await cp(fromPath, join(dest, to), { recursive: true });
}
console.log("[copy-pdfjs-assets] pdf.js assets ready in public/pdfjs/");
