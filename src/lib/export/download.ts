// Browser download helpers. Client-only. Always revokes object URLs so a large
// export doesn't leak memory.
//
// Platform seam: WKWebView ignores the `<a download>` attribute, so the native
// iOS shell must save/share exports through Capacitor instead. Rather than import
// Capacitor here (which would pull it into the web bundle), the native shell
// REGISTERS a handler at boot via setNativeSaveHandler(); web leaves it unset and
// the anchor-click path below is used unchanged.

/** A platform save/share implementation. Returns (or resolves) truthy when it has
 *  handled the save, so the web fallback is skipped. */
export type NativeSaveHandler = (
  blob: Blob,
  filename: string,
) => boolean | void | Promise<boolean | void>;

let nativeSaveHandler: NativeSaveHandler | null = null;

/** Register (or clear with null) the native save/share handler. Called once by the
 *  native shell's bootstrap; never on web. */
export function setNativeSaveHandler(handler: NativeSaveHandler | null): void {
  nativeSaveHandler = handler;
}

/** True when a native save/share handler is installed (native iOS shell). */
export function hasNativeSaveHandler(): boolean {
  return nativeSaveHandler !== null;
}

function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke after the click has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  if (nativeSaveHandler) {
    // Native path: hand the bytes to the shell (Filesystem + Share). Fire and
    // forget; on any failure fall back to the anchor click so nothing is lost.
    Promise.resolve()
      .then(() => nativeSaveHandler!(blob, filename))
      .catch(() => anchorDownload(blob, filename));
    return;
  }
  anchorDownload(blob, filename);
}

/** Convert a `data:image/png;base64,...` URL to a Blob without a network round-trip. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /:(.*?);/.exec(header)?.[1] ?? "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
