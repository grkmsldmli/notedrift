"use client";

import dynamic from "next/dynamic";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AdsProviderFromAuth } from "@/components/ads/AdsProvider";

// The editor owns the DOM canvas and imports Fabric.js (browser-only APIs), so
// it must never run during SSR/prerender. `ssr: false` requires a Client
// Component, which is why this page carries "use client".
const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
});

export default function Home() {
  // AuthProvider is a thin context wrapper — it renders the editor immediately
  // and resolves auth in the background, so the canvas never waits on a session.
  // AdsProviderFromAuth layers ad-eligibility on top of that authoritative plan,
  // so a live Free→Pro upgrade removes the ad band with no reload.
  return (
    <AuthProvider>
      <AdsProviderFromAuth>
        <Editor />
      </AdsProviderFromAuth>
    </AuthProvider>
  );
}
