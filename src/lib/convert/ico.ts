// Minimal, valid ICO encoder — builds a real multi-size favicon (16/32/48 px)
// with PNG-compressed entries (supported by every modern browser and OS). We
// never just rename a PNG to .ico. Runs entirely in the browser.

import { canvasToBlob, decodeImageFile } from "./image";
import type { ConvertResult } from "./types";

export const ICO_SIZES = [16, 32, 48] as const;

async function pngAtSize(
  dec: { draw(ctx: CanvasRenderingContext2D, w: number, h: number): void },
  size: number,
): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not create a drawing canvas.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  dec.draw(ctx, size, size);
  const blob = await canvasToBlob(canvas, "image/png");
  canvas.width = 0;
  canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

export async function createIco(file: File, filename: string): Promise<ConvertResult> {
  const dec = await decodeImageFile(file);
  try {
    const images = await Promise.all(ICO_SIZES.map((s) => pngAtSize(dec, s)));
    const count = images.length;
    const headerSize = 6 + count * 16;
    const total = headerSize + images.reduce((sum, img) => sum + img.byteLength, 0);

    const buf = new ArrayBuffer(total);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    // ICONDIR
    view.setUint16(0, 0, true); // reserved
    view.setUint16(2, 1, true); // type: 1 = icon
    view.setUint16(4, count, true); // image count

    let entryOff = 6;
    let dataOff = headerSize;
    images.forEach((img, i) => {
      const size = ICO_SIZES[i];
      view.setUint8(entryOff + 0, size >= 256 ? 0 : size); // width (0 = 256)
      view.setUint8(entryOff + 1, size >= 256 ? 0 : size); // height
      view.setUint8(entryOff + 2, 0); // color palette count
      view.setUint8(entryOff + 3, 0); // reserved
      view.setUint16(entryOff + 4, 1, true); // color planes
      view.setUint16(entryOff + 6, 32, true); // bits per pixel
      view.setUint32(entryOff + 8, img.byteLength, true); // size of image data
      view.setUint32(entryOff + 12, dataOff, true); // offset of image data
      bytes.set(img, dataOff);
      entryOff += 16;
      dataOff += img.byteLength;
    });

    const blob = new Blob([buf], { type: "image/x-icon" });
    return { blob, filename, mime: "image/x-icon", bytes: blob.size };
  } finally {
    dec.close();
  }
}
