# NoteDrift

**Open. Think. Create.**

An instant, browser-based scratch space. Open it and you get a clean, infinite
white canvas immediately — no sign-up, no login, no onboarding, no dashboard.
Write, draw, sketch, diagram, or brainstorm the moment the page loads. Your work
is saved locally and survives refreshes automatically.

NoteDrift is **local-first**: the core editor works fully anonymously, entirely
in your browser. Signing in is **optional** and only unlocks cloud sync; a Pro
subscription only raises the cloud-canvas limit. Anonymous local use is never
gated.

> `/` opens directly into the editor. The blank canvas _is_ the product — there is
> no marketing homepage or onboarding wall.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Other scripts:

```bash
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
npm test         # unit tests (node --test)
npx tsc --noEmit # type-check
```

Requires Node 18+ (developed on Node 24).

### Configuration

NoteDrift runs with **no configuration** — auth, cloud, and billing simply stay
disabled until you provide the relevant environment variables. Copy
[`.env.example`](.env.example) to `.env.local` and fill in what you need:

- **Supabase** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`) enables accounts + cloud canvases.
- **Stripe** (`STRIPE_BILLING_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_*`,
  `STRIPE_WEBHOOK_SECRET`) enables Pro billing. Billing is explicitly **test** or
  **live** and fails closed on a mismatched key/origin — see
  [`docs/launch/`](docs/launch/).

Never put a secret in a `NEXT_PUBLIC_*` variable; server secrets are read only by
route handlers behind `server-only` modules and never reach the browser.

For production launch, follow
[`docs/launch/LAUNCH_CHECKLIST.md`](docs/launch/LAUNCH_CHECKLIST.md).

---

## Tech stack

| Concern       | Choice                                                    |
| ------------- | --------------------------------------------------------- |
| Framework     | Next.js 16 (App Router) + React 19                        |
| Language      | TypeScript (strict)                                       |
| Styling       | Tailwind CSS v4                                           |
| Canvas engine | [Fabric.js](http://fabricjs.com/) v7 — **MIT**            |
| PDF           | pdf.js (render) + pdf-lib (export), self-hosted           |
| Icons         | lucide-react — **ISC**                                    |
| Local storage | IndexedDB (canvas docs) + localStorage (page index/prefs) |
| Accounts + cloud | Supabase (auth, Postgres + RLS, private storage) — optional |
| Billing       | Stripe (hosted Checkout + Customer Portal, webhooks) — optional |

Everything in the core editor runs in the browser and stores data locally. The
optional cloud and billing layers are server-authoritative: entitlements are
decided on the server (verified Stripe webhooks → Supabase billing state), never
by the client.

### Why Fabric.js?

We needed a mature, commercially-licensed engine that ships freehand drawing,
text, shapes, selection/transform, JSON (de)serialization, and PNG export out of
the box — while still letting us build our _own_ minimal, branded UI on top.
Fabric.js is **MIT licensed** (free for commercial use, no watermark, no fee),
battle-tested since 2010, and gives us object serialization (`toJSON`/
`loadFromJSON`) that makes autosave and undo/redo straightforward.

Alternatives considered: **tldraw** (excellent, but its license requires a
watermark or a paid business license) and **Excalidraw** (MIT, but ships its own
full app UI that would fight the custom toolbar/top-bar layout we want).

---

## Architecture

Three decoupled layers, in order of how load-bearing they are:

1. **Local-first core editor** (always on, anonymous). Imperative canvas logic
   (Fabric) is separated from declarative UI (React); React never touches Fabric
   directly. Canvas documents live in IndexedDB; the page index and preferences
   in localStorage. Autosave is debounced and independent of everything below.
2. **Optional cloud** (signed-in only, explicit). A canvas syncs to the cloud
   only when you choose _Save to cloud_. Documents and content-addressed image
   assets are stored per-account with row-level security; one account can never
   read another's data. Local save always works independently of cloud.
3. **Optional Pro billing** (server-authoritative). Stripe-hosted checkout, a
   verified-webhook-driven subscription record, and a server-side entitlement gate
   decide who is Pro. The client can never self-promote; the only shipped Pro
   benefit today is unlimited cloud canvases (Free is capped at 3).

```
src/
  app/
    layout.tsx              Root layout, fonts, metadata, security headers
    page.tsx                Client entry — dynamically imports the editor (ssr:false)
    robots.ts / sitemap.ts  SEO metadata routes (derived from tool registries)
    (legal)/                /privacy, /terms (public, server-rendered)
    tools/                  Free Tools: converters, PDF editor, audio tools
    auth/callback/          Magic-link / OAuth callback
    api/billing/*           Stripe checkout / confirm / portal (server-only)
    api/stripe/webhook/     Stripe webhook receiver (signature-verified)
  components/               Editor, tools, billing, auth, legal, nav UI
  lib/
    canvasController.ts     The Fabric engine wrapper (the heart of the editor)
    storage.ts              IndexedDB + localStorage persistence
    plans.ts                Entitlement/pricing source of truth
    billing/                Stripe mode, config, prices, webhook, reconcile (server-only)
    cloud/                  Cloud sync engine, manifest, links
    auth/                   Supabase browser/server clients + plan derivation
    convert/ · audio/       Free-tool registries and pure logic
supabase/migrations/        Cloud + billing schema (RLS, entitlement RPCs)
docs/                       PRODUCT_MODEL.md + docs/launch/ runbooks
```

---

## Features

**Core editor (Free, anonymous):** infinite canvas with optional grid; Select,
Pen, Text, Rectangle, Ellipse, Line, Arrow, Sticky note, Eraser, image insert;
select/move/resize; undo/redo; zoom/pan; paste & drop images; 2× PNG export; New
Page + recent-pages list; automatic local save. Unlimited **local** canvases,
always free.

**Cloud (optional, signed-in):** explicit Save to cloud, cross-device sync,
conflict-safe revisioned updates; Free = 3 cloud canvases, Pro = unlimited (local
stays unlimited regardless).

**Free Tools (`/tools`, public, no signup):** browser-side image/PDF converters,
image compress/resize, a full **PDF Editor**, and **audio tools** (Sound Meter,
Tap BPM, Metronome). Files never leave the device.

### Keyboard shortcuts

| Key                               | Action                |
| --------------------------------- | --------------------- |
| `V`                               | Select                |
| `P`                               | Pen                   |
| `T`                               | Text                  |
| `R` / `O` / `L`                   | Rect / Ellipse / Line |
| `A`                               | Arrow                 |
| `N`                               | Sticky note           |
| `E`                               | Eraser                |
| `Delete` / `Backspace`            | Delete selection      |
| `Ctrl/⌘ + Z`                      | Undo                  |
| `Ctrl/⌘ + Shift + Z` / `Ctrl + Y` | Redo                  |
| `Ctrl/⌘ + +/−/0`                  | Zoom in / out / reset |
| Hold `Space` + drag               | Pan                   |

---

## Honest limitations

- **Eraser** deletes whole objects, not pixels.
- **Sound Meter** is an approximate indicator, **not** a certified professional
  SPL meter.
- **PDF whiteout** is an opaque cover, **not** secure redaction — the underlying
  content is not removed.
- Desktop-first; touch works but isn't fully tuned.

See [`docs/PRODUCT_MODEL.md`](docs/PRODUCT_MODEL.md) for the full Free/Pro model.

---

## License notes

- Fabric.js — MIT
- lucide-react — ISC
- Patrick Hand (canvas handwriting font) — SIL Open Font License 1.1

All free for commercial use. See `node_modules/<pkg>/LICENSE` and
`public/fonts/`.
