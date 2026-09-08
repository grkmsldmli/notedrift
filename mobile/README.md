# mobile/ — NoteDrift native (Capacitor) web client

A thin **Vite** app that **reuses** the production editor from `../src` and bundles
it offline into `mobile/dist`, which Capacitor packages as the iOS app's local
`webDir`. It does **not** fork the editor or canvas engine.

- `index.html`, `src/main.tsx` — entry; mounts `AuthProvider → AdsProvider → Editor`
  (same composition as the web root page), reusing shared modules via the `@` alias.
- `src/shims/` — tiny stand-ins for the few Next-only imports the editor pulls in
  (`next/link`, `next/script`, …), wired via `vite.config.ts` `resolve.alias`.
- `src/native/` — native-only adapters (download→Share, status bar). No-op on web.
- `src/styles.css` — imports the web app's `globals.css` (Tailwind v4 + theme).

Build: `npm run mobile:build` (from repo root). Full flow: see
`docs/ios/IOS_ARCHITECTURE.md`. `mobile/dist/` is generated (gitignored).
