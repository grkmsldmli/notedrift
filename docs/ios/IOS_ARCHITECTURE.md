# NoteDrift iOS — Architecture (Capacitor, Phase 1)

Status: **buildable native shell + architecture**. Not yet submitted. StoreKit
IAP and Sign in with Apple are the next phase.

## 1. The decision: local bundle that reuses the web editor

The iOS app is a **Capacitor** native shell that boots from a **LOCAL** web bundle
(`mobile/dist`). It is **not** a remote-website wrapper — there is deliberately no
production `server.url` in `capacitor.config.ts`.

The local bundle is built by a small **Vite** app (`mobile/`) that **imports the
existing NoteDrift editor** from `src/` rather than forking it. This is safe
because:

- `src/lib/canvasController.ts` — the whole canvas engine — is **framework-
  agnostic** (imports only `fabric` + local modules; zero React/Next/server).
- `src/components/editor/Editor.tsx` uses **no** Next router/navigation.
- The only Next couplings in the editor graph are `next/link` (2 files) and
  `next/script` (the AdSense loader), which the Vite build maps to tiny shims.

The Next.js web app (`notedrift.com`) is **unchanged** and remains the production
web front-end **and** the backend for auth, cloud sync, billing, and email.

```
┌─────────────────────────── iOS app (Capacitor) ───────────────────────────┐
│  WKWebView  ←  mobile/dist  (LOCAL, offline)                               │
│     └─ reuses src/ editor (canvasController, Editor.tsx, tools, export)    │
│     └─ native adapters: download→Share, status bar                        │
│                                                                            │
│  server-required calls ──HTTPS──▶ https://notedrift.com  (unchanged)      │
│  auth / cloud / entitlement ─────▶ Supabase (direct SDK, bearer token)    │
└────────────────────────────────────────────────────────────────────────────┘
```

## 2. What is bundled locally vs what stays remote

| Bundled LOCALLY in the app (`mobile/dist`) | Stays REMOTE (notedrift.com / Supabase) |
|---|---|
| The whole editor + canvas engine (`canvasController`, Fabric) | Supabase Auth (OTP verify, session) |
| Local persistence: IndexedDB (canvases) + localStorage (prefs) | Cloud canvas sync (Supabase RPC/Storage) |
| Export engine (PNG/SVG/PDF via `pdf-lib`) | Entitlement source of truth (`get_billing_status` RPC) |
| Self-hosted fonts + pdf.js worker (`public/`) | Stripe checkout/portal, `/api/billing/*` (web only) |
| Tailwind CSS + NoteDrift theme | Lifecycle email `/api/email/*` |
| Native adapters (Share, status bar) | — |

The app **opens and shows the editor with no network** (canvas, tools, local save
all work offline). Network is needed only for sign-in and cloud sync.

## 3. Dependency audit (A/B/C/D)

`A` = reused as-is · `B` = thin platform adapter · `C` = web-only, not bundled ·
`D` = server-only, called remotely.

| Area | Class | Notes |
|---|---|---|
| `canvasController.ts` + `lib/shapes|brush|connectors|history|colors|editor|tools` | **A** | Framework-agnostic core. Reused, never forked. |
| `Editor.tsx` + editor UI components | **A** | Client React; no Next router. |
| `lib/storage.ts` (IndexedDB + localStorage) | **A** | WKWebView-safe. |
| `<input type=file>` image import | **A** | Native photo/file picker; needs Info.plist string. |
| pdf.js worker (`/pdfjs/*`, root-absolute) | **A** | Bundled from `public/`; no `assetPrefix`. |
| `export/download.ts` `downloadBlob` + canvas inline PNG | **B** | Native Share seam (below). |
| `next/link` (TopBar, FirstRun) | **B** | Vite shim → opens web routes externally. |
| `email/notify.ts` `/api/email/*` | **B/D** | Absolute base via `apiUrl()`; best-effort. |
| Supabase session persistence | **B** | Cookie storage on the local origin — see §7 caveat. |
| Google Identity Services sign-in | **C** | WKWebView-blocked; hidden on native. |
| AdSense (`BottomAdBand`, `AdSenseLoader`, `next/script`) | **C** | Never loads on native (seam + shim). |
| Cloud client (`lib/cloud/*`) | **D** | Supabase SDK, bearer token, CORS-OK cross-origin. |
| Stripe (`/api/billing/*`, `lib/billing/*` server) | **D** | `server-only`; never in the client bundle. Not callable from native UI. |
| `lib/auth/server.ts` (`next/headers`) | **D** | Server-only; not in the client editor graph. |

## 4. The platform seam (`src/lib/platform.ts`)

One module, used by web and native, so components never sprinkle Capacitor checks:

- `isNative()` / `isNativeIos()` — runtime detection via the `window.Capacitor`
  bridge (no `@capacitor/core` import; SSR-safe, false on web).
- `apiBaseUrl()` / `apiUrl(path)` — `""` (same-origin) on web; `https://notedrift.com`
  on native, so `/api/...` calls reach the real backend.
- `billingPlatform()` → `"stripe"` on web, `"apple"` on native iOS.

Seams that consume it (all gated by `isNative*`, web behavior unchanged):

| Seam | File | Behavior on native |
|---|---|---|
| Ads off | `src/lib/ads/config.ts` `adsConfigured()` | returns `false` → no AdSense script, no ad surfaces |
| Billing → Apple | `src/components/billing/UpgradeDialog.tsx` | shows an IAP placeholder; `upgrade()` never calls Stripe |
| Hide Stripe portal | `src/components/auth/AccountButton.tsx` | Pro users see a static "Pro active" row, no portal |
| Hide Google | `src/components/auth/SignInDialog.tsx` | Google button + divider hidden; Email OTP only |
| API base | `src/lib/email/notify.ts` | absolute `https://notedrift.com` base |
| Download → Share | `src/lib/export/download.ts` (registerable handler) | native shell registers Filesystem+Share (`mobile/src/native/save.ts`) |

The download seam uses a **registerable handler** so shared code imports **no**
Capacitor — the web bundle is byte-for-byte behavior-identical; the native shell
calls `setNativeSaveHandler(...)` at boot.

## 5. Auth status

- **Email OTP works on native.** `signInWithOtp` / `verifyOtp` go **directly** to
  Supabase (no redirect, no `/auth/callback`, no same-origin cookie). The session
  is stored by `@supabase/ssr` on the local Capacitor origin.
- **Reading Pro entitlement works on native** with **zero** purchase calls —
  `get_billing_status()` is a direct Supabase RPC. A user who bought Pro on the web
  gets full entitlements (ad-free, pro exports) inside the app automatically.
- **Google is hidden on native** (WKWebView blocks GIS; a local origin can't be a
  registered Google JS origin). Web Google login is unchanged.
- **`/api/*` cookie-authed routes** (billing, email) return 401 from native because
  the session cookie lives on the local origin, not `notedrift.com`. OTP and
  entitlement reads do **not** use these routes, so sign-in and Pro both work.

## 6. Billing status (Apple compliance)

- **No Stripe checkout or portal is reachable from the iOS UI.** `UpgradeDialog`
  shows an IAP placeholder on native and `upgrade()` early-returns before any
  Stripe call; the account menu hides "Manage billing".
- Existing Pro (purchased on the web) is **honored** — entitlement is server-
  authoritative and read via Supabase.
- **No fake Apple purchases.** StoreKit IAP is a separate next phase.

## 7. File import / export status

- **Export** (PNG/SVG/PDF): routes through `downloadBlob`, which on native writes
  the file to the app cache (Capacitor Filesystem) and presents the **native Share
  sheet** (Save to Files, Photos, AirDrop). Web download is unchanged.
- **Import**: `<input type=file>` renders the native photo/file picker in WKWebView
  — no code adapter needed, only the Info.plist photo-library string (added).

## 8. iPhone / iPad + UX

- Portrait + landscape on iPhone and iPad (Info.plist, default Capacitor).
- `viewport-fit=cover` + `env(safe-area-inset-*)` (the editor already uses these).
- `user-scalable=no` and `overscroll-behavior: none` — no page zoom, no rubber-band;
  the canvas owns its gestures via `touch-action`.
- Keyboard: `resize: "none"` so the editor's existing `visualViewport` inset
  tracking drives layout (matches web).
- Status bar: light content over the dark ground (`mobile/src/native/shell.ts`).
- The iPad Safari pointer-ownership fixes in `canvasController.ts` are **untouched**.

## 9. Privacy / permissions

- Declared: **`NSPhotoLibraryUsageDescription`** only (truthful — image import).
- **Not** requested: camera, microphone, location, contacts, tracking.
- Sound Meter (microphone) is a `/tools` web page and is **not** in the app bundle,
  so no microphone permission is added.
- `ITSAppUsesNonExemptEncryption = false` (standard HTTPS only).
- Apple **privacy manifest** (`PrivacyInfo.xcprivacy`) declaring required-reason API
  usage (UserDefaults, file timestamps) is a Mac/Xcode task — see APP_STORE_CHECKLIST.

## 10. Build & run

```bash
npm run mobile:build   # copies pdf.js assets, Vite-builds mobile/dist
npm run ios:sync       # mobile:build + npx cap sync ios   (Mac for pods)
npm run ios:open       # opens ios/App/App.xcworkspace in Xcode (Mac only)
```

`capacitor.config.ts`: `appId = com.notedrift.app`, `appName = NoteDrift`,
`webDir = mobile/dist`, **no `server` block**.

## 11. What requires a Mac

Everything web/bundle-related runs on any OS. These need macOS + Xcode:

- `pod install` (CocoaPods) — skipped automatically on Windows during `cap add ios`.
- `npx cap sync ios` fully (pods), `npx cap open ios`, Xcode build/run/archive.
- Signing, provisioning, TestFlight upload.
- Adding `PrivacyInfo.xcprivacy` and final device testing.

## 12. Reused, not forked

The canvas engine and editor are **imported** from `src/`. The mobile app adds only:
a Vite entry, Next-import shims, and two native adapters. Any editor change on the
web is automatically in the app on the next `mobile:build`.
