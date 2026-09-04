// Load a user-picked image safely for placement. Raster only (SVG is rejected
// so nothing scriptable is embedded), size + dimension bounded, WebP and huge
// images normalized to PNG via a canvas so pdf-lib can embed them. Browser-only;
// bytes never leave the device.

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 4000;

export interface LoadedImage {
  el: HTMLImageElement;
  src: string; // data URL
  format: "png" | "jpg";
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image couldn't be decoded."));
    img.src = src;
  });
}

export async function loadImageFromFile(file: File): Promise<LoadedImage> {
  if (file.size > MAX_BYTES) throw new Error("That image is too large (max 25 MB).");
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error("Please choose a PNG, JPG or WebP image.");
  }
  const dataUrl = await readAsDataURL(file);
  const img = await loadImg(dataUrl);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const isWebp = /webp/i.test(file.type);

  if (longest <= MAX_EDGE && !isWebp) {
    return { el: img, src: dataUrl, format: /png/i.test(file.type) ? "png" : "jpg" };
  }
  // Re-encode (downscale + WebP→PNG) through a canvas.
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.drawImage(img, 0, 0, w, h);
  const png = canvas.toDataURL("image/png");
  return { el: await loadImg(png), src: png, format: "png" };
}

/** Load a data URL (already produced locally, e.g. a drawn/typed signature). */
export async function loadImageFromDataUrl(src: string, format: "png" | "jpg" = "png"): Promise<LoadedImage> {
  return { el: await loadImg(src), src, format };
}
