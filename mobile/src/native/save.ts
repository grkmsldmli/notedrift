// Native download→share adapter. WKWebView ignores `<a download>`, so on iOS we
// write the export to the app cache and present the native Share sheet (Save to
// Files, Photos, AirDrop, …). Registered into the shared download seam
// (src/lib/export/download.ts) so EVERY editor export (PNG/SVG/PDF) routes here on
// native, with zero changes at the call sites. No-op on web.
import { setNativeSaveHandler } from "@/lib/export/download";
import { isNative } from "@/lib/platform";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = String(reader.result);
      // strip the "data:<mime>;base64," prefix
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export function registerNativeSave(): void {
  if (!isNative()) return;
  setNativeSaveHandler(async (blob, filename) => {
    // Import the plugins lazily so they only load inside the native shell.
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: filename, url: written.uri, files: [written.uri] });
    } catch {
      // The user dismissing the share sheet is not an error — the file is already
      // written to the app cache.
    }
    return true;
  });
}
