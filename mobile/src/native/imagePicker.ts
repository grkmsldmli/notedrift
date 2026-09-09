// Native image-pick adapter. Registers a Capacitor Camera–backed picker into the
// shared seam (src/lib/image/native.ts) so tapping Image on iOS opens the OS
// camera / photo library reliably (fixing the WKWebView camera crash), converts
// the result to File[], and hands it to the SAME insert path the web input uses
// (canvasController.addImageFiles). No-op on web. Plugins are imported lazily so
// they only load inside the native shell.
import { setNativeImagePicker, type NativeImageSource } from "@/lib/image/native";
import { isNative } from "@/lib/platform";

async function webPathToFile(webPath: string, baseName: string): Promise<File | null> {
  try {
    const res = await fetch(webPath);
    const blob = await res.blob();
    // Capacitor Camera returns JPEG/PNG (HEIC is transcoded), and correctOrientation
    // bakes EXIF rotation in — so the shared normalizer receives a clean image.
    const type = blob.type || "image/jpeg";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    return new File([blob], `${baseName}.${ext}`, { type });
  } catch {
    return null;
  }
}

export function registerNativeImagePicker(): void {
  if (!isNative()) return;
  setNativeImagePicker(async (source: NativeImageSource): Promise<File[]> => {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const stamp = Date.now();
    try {
      if (source === "camera") {
        const photo = await Camera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.Uri,
          quality: 92,
          correctOrientation: true,
        });
        if (!photo.webPath) return [];
        const file = await webPathToFile(photo.webPath, `photo-${stamp}`);
        return file ? [file] : [];
      }
      if (source === "library") {
        const result = await Camera.pickImages({ quality: 92, correctOrientation: true });
        const files: File[] = [];
        for (let i = 0; i < result.photos.length; i++) {
          const file = await webPathToFile(result.photos[i].webPath, `image-${stamp}-${i}`);
          if (file) files.push(file);
        }
        return files;
      }
      return []; // "files" is handled by the web <input> on the JS side
    } catch {
      // The user cancelling, or denying permission, must never throw/crash — we
      // simply add no image. (iOS shows the system permission prompt itself.)
      return [];
    }
  });
}
