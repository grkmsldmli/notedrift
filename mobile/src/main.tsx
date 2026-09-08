// Native iOS entry. Mounts the SAME editor composition as the web root page
// (src/app/page.tsx) — AuthProvider → AdsProvider → Editor — reusing every shared
// module. Ads are inert on native via the platform seam in ads/config.ts, and the
// native shell registers the download→share and status-bar adapters at boot.
import "./process-shim"; // must be first: installs the process.env guard
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AdsProviderFromAuth } from "@/components/ads/AdsProvider";
import Editor from "@/components/editor/Editor";
import { registerNativeSave } from "./native/save";
import { initNativeShell } from "./native/shell";
import { registerNativeAuthStorage } from "./native/authStorage";
import { registerStoreKitBilling } from "./native/storekit";

// Wire native-only adapters. All no-op on any non-native runtime. Auth storage is
// registered FIRST, before any Supabase client is created, so the session persists.
registerNativeAuthStorage();
registerNativeSave();
registerStoreKitBilling();
void initNativeShell();

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root not found");

createRoot(container).render(
  <StrictMode>
    <AuthProvider>
      <AdsProviderFromAuth>
        <Editor />
      </AdsProviderFromAuth>
    </AuthProvider>
  </StrictMode>,
);
