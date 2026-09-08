import type { CapacitorConfig } from "@capacitor/cli";

// NoteDrift native shell. The app boots from LOCAL bundled web assets in
// `mobile/dist` (built by `npm run mobile:build`) — there is deliberately NO
// production `server.url`, so this is a real offline-capable client, not a remote
// website wrapper. Server-required calls target https://notedrift.com explicitly
// via src/lib/platform.ts (apiBaseUrl) and the Supabase SDK.
const config: CapacitorConfig = {
  appId: "com.notedrift.app",
  appName: "NoteDrift",
  webDir: "mobile/dist",
  // No `server` block: no server.url, no cleartext, no allowNavigation override.
  ios: {
    // Let the WKWebView content extend under the safe areas; the web layout uses
    // env(safe-area-inset-*). Background matches the app's dark ground.
    backgroundColor: "#0a0b10",
    contentInset: "never",
  },
  plugins: {
    Keyboard: {
      // Don't resize the WebView on keyboard show — the editor already tracks the
      // soft-keyboard inset via visualViewport (Editor.tsx), matching the web.
      resize: "none",
    },
  },
};

export default config;
