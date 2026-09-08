// Native shell setup: status-bar appearance for NoteDrift's dark UI. Plugins are
// imported lazily and every call is defensive so a missing plugin never blocks the
// editor from mounting. No-op on web.
import { isNative } from "@/lib/platform";

export async function initNativeShell(): Promise<void> {
  if (!isNative()) return;

  // Light status-bar content over NoteDrift's dark background. (In Capacitor,
  // Style.Dark means light text/icons, intended for dark backgrounds.)
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* status-bar plugin unavailable — non-fatal */
  }
}
