// Predictable, human output filenames. Pure — unit-tested.

/** The filename without its directory or final extension. */
export function baseName(filename: string): string {
  const slash = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  const name = slash >= 0 ? filename.slice(slash + 1) : filename;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** The lowercase extension (no dot), or "". */
export function extensionOf(filename: string): string {
  const slash = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  const name = slash >= 0 ? filename.slice(slash + 1) : filename;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Build an output filename: `<base><suffix>.<ext>`.
 *   outputName("photo.png", "jpg")               → "photo.jpg"
 *   outputName("photo.jpg", "jpg", "-compressed") → "photo-compressed.jpg"
 *   outputName("photo.jpg", "jpg", "-1200x800")   → "photo-1200x800.jpg"
 *   outputName("document.pdf", "png", "-page-2")  → "document-page-2.png"
 */
export function outputName(inputFilename: string, ext: string, suffix = ""): string {
  const base = baseName(inputFilename).trim() || "file";
  return `${base}${suffix}.${ext}`;
}
