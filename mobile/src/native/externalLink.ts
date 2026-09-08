// Open a URL outside the local bundle using the Capacitor Browser plugin (a real
// in-app SFSafariViewController on iOS), with a window.open fallback. Used by the
// next/link shim so legal/help/support links open reliably in WKWebView instead of
// trying to navigate the local WebView to a route that isn't bundled.
import { Browser } from "@capacitor/browser";

export async function openExternalUrl(url: string): Promise<void> {
  try {
    await Browser.open({ url });
  } catch {
    try {
      window.open(url, "_blank");
    } catch {
      /* nothing else to try */
    }
  }
}
