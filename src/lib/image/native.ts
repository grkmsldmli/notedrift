// Registerable native image-pick seam. Shared editor code calls through this; it
// imports no Capacitor, so the web bundle is unaffected. On native iOS the shell
// registers a Capacitor Camera–backed picker at boot (mobile/src/native/
// imagePicker.ts); on web it stays null and the hidden <input type=file> is used.
//
// The picker returns File[] so it plugs into the SAME insert path as the web input
// (canvasController.addImageFiles), which normalizes (incl. HEIC→JPEG), sizes,
// centers, and records one undo. A cancelled pick resolves to an empty array.

export type NativeImageSource = "library" | "camera" | "files";

export type NativeImagePicker = (source: NativeImageSource) => Promise<File[]>;

let impl: NativeImagePicker | null = null;

/** Register (or clear) the native image picker. Called once by the native shell;
 *  never on web. */
export function setNativeImagePicker(picker: NativeImagePicker | null): void {
  impl = picker;
}

export function getNativeImagePicker(): NativeImagePicker | null {
  return impl;
}
