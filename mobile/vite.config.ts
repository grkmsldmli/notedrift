import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The mobile client is a thin Vite shell that REUSES the production editor from
// ../src (canvasController is framework-agnostic; Editor.tsx uses no Next router).
// It bundles offline into mobile/dist, which Capacitor packages as the local
// webDir. The Next.js web app is never touched by this build.

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, "..");
const src = path.resolve(repoRoot, "src");
const shim = (f: string) => path.resolve(dir, "src/shims", f);

// Map the handful of Next-only imports the reused editor graph pulls in to local
// shims (next/link is the only one actually reached; the rest are defensive).
const nextAliases: Record<string, string> = {
  "next/link": shim("next-link.tsx"),
  "next/script": shim("next-script.tsx"),
  "next/navigation": shim("next-navigation.ts"),
  "next/image": shim("next-image.tsx"),
  "next/dynamic": shim("next-dynamic.ts"),
  "next/font/google": shim("next-font-google.ts"),
  "next/headers": shim("next-headers.ts"),
  "server-only": shim("empty.ts"),
};

// PUBLIC NEXT_PUBLIC_* values baked into the bundle. Read from the build
// environment (the owner sets real values for a store build); default to "" so
// the bundle ALWAYS builds deterministically and boots to the editor offline.
const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_ADSENSE_ENABLED",
  "NEXT_PUBLIC_ADSENSE_CLIENT_ID",
  "NEXT_PUBLIC_ADSENSE_SLOT_EDITOR_BOTTOM",
  "NEXT_PUBLIC_ADSENSE_SLOT_TOOLS",
  "NEXT_PUBLIC_ADSENSE_SLOT_TOOL_PAGE",
];

const define: Record<string, string> = {
  "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
  "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(
    process.env.NEXT_PUBLIC_SITE_URL || "https://notedrift.com",
  ),
};
for (const k of PUBLIC_ENV_KEYS) {
  define[`process.env.${k}`] = JSON.stringify(process.env[k] ?? "");
}

export default defineConfig({
  root: dir,
  // Relative asset URLs so the bundle loads from the Capacitor local origin
  // regardless of scheme; hardcoded root paths (e.g. /pdfjs/, /fonts/) still
  // resolve from the webDir root.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": src,
      ...nextAliases,
    },
  },
  define,
  // Reuse ALL of the web app's public assets (self-hosted fonts, the generated
  // pdf.js worker/cmaps, icons) so the offline bundle is self-contained.
  publicDir: path.resolve(repoRoot, "public"),
  build: {
    outDir: path.resolve(dir, "dist"),
    emptyOutDir: true,
  },
});
