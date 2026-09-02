"use client";

import dynamic from "next/dynamic";

// The editor owns the DOM canvas and imports Fabric.js (browser-only APIs), so
// it must never run during SSR/prerender. `ssr: false` requires a Client
// Component, which is why this page carries "use client".
const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
});

export default function Home() {
  return <Editor />;
}
