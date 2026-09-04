// Trigger a browser download of an in-memory Blob and clean up the object URL.
// The file never leaves the device.

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the download has surely started.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
