# NoteDrift — Product Model (Free / Pro)

> **Authoritative.** This document defines NoteDrift's business model and the
> architecture future phases must follow. When code and this document disagree,
> treat the disagreement as a bug. The machine-readable source of truth for
> capabilities and pricing is [`src/lib/plans.ts`](../src/lib/plans.ts); this
> document is its prose companion. Phase 2.0 established both. No authentication,
> cloud, Stripe, AI, collaboration, or file-converter code exists yet — the
> sections below marked _(future)_ are design intent, not shipped features.

## The four load-bearing statements

These are non-negotiable. Every future change is measured against them.

1. **Unlimited local canvases are Free.** There is no "3 free documents", no
   "5 local canvases", no local-content cap of any kind, ever.
2. **Cloud limits are NOT local creation limits.** The Free cloud cap (3) counts
   only canvases stored _in the cloud_. A Free user with 27 local canvases can
   still make unlimited more local ones.
3. **Core creation tools are not Pro-gated.** Every drawing/writing/organizing
   tool that shipped in Phase 1.6 is Free forever.
4. **Anonymous local use does not require an account.** Visiting `/` opens the
   editor instantly — no login wall, pricing modal, onboarding, or cloud prompt.

## What we monetize (and what we don't)

NoteDrift is instant digital paper: **"Open. Think. Create."** The Free product
must stay genuinely useful indefinitely. We do **not** monetize the quality of
basic creation. We monetize **continuity and professional workflow**:

- continuity (sync across devices)
- cloud (backup, availability)
- organization (folders/notebooks at scale)
- history (long-term version retention)
- privacy & sharing (private links, collaboration)
- professional export
- future AI capacity

> Free users get excellent digital paper. Pro users get a **persistent, synced,
> professional workspace.**

## Three states: Anonymous · Free · Pro

Kept deliberately separate from _authentication_ and _subscription_ — a `Plan`
is derived elsewhere and passed into the entitlement layer.

| | **Anonymous** | **Free account** | **Pro** |
|---|---|---|---|
| Full core editor | ✅ | ✅ | ✅ |
| Unlimited **local** canvases | ✅ | ✅ | ✅ |
| Local autosave | ✅ | ✅ | ✅ |
| Account required | ❌ | for cloud only | yes |
| Cloud sync _(future)_ | ❌ | ✅ | ✅ |
| Cloud canvas limit _(future)_ | 0 | **3** | ∞ |
| Version history _(future)_ | — | ~7 days | long-term / ∞ |
| Public view sharing _(future)_ | ❌ | limited | ✅ |
| Private sharing / collab _(future)_ | ❌ | ❌ | ✅ |
| Standard PNG / single-page PDF | ✅ | ✅ | ✅ |
| HD/4K/Transparent PNG, SVG, selection, multi-page PDF, custom size _(future)_ | ❌ | ❌ | ✅ |
| AI allowance _(future)_ | 0 | small | larger |
| Ads | none | none | none (always) |

### Free plan (canonical)

Everything in Phase 1.6 stays Free: Pen · Pencil · Marker · Highlighter · Brush ·
Technical Pen · Eraser · Shapes · Lines · Arrows · Diagrams · Text · Sticky notes ·
Images · Crop · Lasso · Group/Ungroup · Align/Distribute · Lock · Mind maps ·
Tool Library · Hand/navigation · paper backgrounds. Plus **unlimited local
canvases**, local autosave, no account required, and **Standard PNG + single-page
PDF** export (a user can always get their own work out).

_Future_ Free cloud plan: up to **3 cloud canvases** (local stays unlimited),
~7-day version history on cloud docs, limited public view sharing, a small AI
allowance. No ads at launch.

### Pro plan (canonical)

Pro is **$3.99/month** or **$29.99/year** (see Pricing). Pro adds _(all future)_:
unlimited cloud canvases + device sync + cloud backup; advanced/unlimited
folders & notebooks; long-term/unlimited version history; unlimited public
sharing, private links, and collaboration when built; professional export
(HD PNG, 4K PNG, transparent PNG, SVG, export selection, multi-page PDF, custom
dimensions); a larger AI allowance; always ad-free.

### The four Pro pillars (how Pro is positioned)

Pro is sold as four promises, not a random checklist:

1. **Sync everywhere** — start on one device, continue on another.
2. **Never lose your work** — cloud backup + version history.
3. **Stay organized** — unlimited cloud canvases + organization.
4. **Share & export professionally** — private sharing + professional exports.

A future fifth pillar: **AI assistance.**

## Pricing

Canonical constants live once, in `PRICING` in `src/lib/plans.ts`. **Never**
hardcode a price string elsewhere — derive it.

- Monthly: **$3.99**
- Annual: **$29.99** (≈ **$2.50/mo** effective)
- Annual saving vs. 12× monthly: `3.99 × 12 − 29.99 = $17.89` (**≈ 37%**)

`annualMonthlyEquivalent()`, `annualSavingsUsd()`, and `annualSavingsPercent()`
compute these from the two constants so marketing copy can never drift.

## Entitlement architecture

One centralized capability model in `src/lib/plans.ts`. Do **not** scatter
`if (isPro)` / `plan === "pro"` / `if (!free)` through components.

```ts
type Plan = "anonymous" | "free" | "pro";

getEntitlements(plan): Entitlements          // the whole set
can(plan, capability): boolean               // boolean gates
limitOf(plan, capability): number            // numeric limits (Infinity = unlimited)
canCreateLocalCanvas(): boolean              // always true — encoded so it can't be gated
canAddCloudCanvas(plan, currentCloudCount): boolean   // gates the CLOUD only
```

Capabilities are strongly typed (`Capability`, split into `BooleanCapability` and
`NumericCapability`), and entitlement objects are `Object.freeze`d so they can't
be mutated at runtime. Adding a capability is done in exactly one place — the
`Entitlements` interface and the three plan records.

### Cloud limit semantics (the easiest thing to get wrong)

`canAddCloudCanvas(plan, currentCloudCount)` compares **only the cloud count**
against the plan's `cloudCanvasLimit`. Local canvases are never passed in and
never counted. Concretely, a Free user with **27 local + 3 cloud** canvases:

- can create **unlimited** more **local** canvases (`canCreateLocalCanvas()` is
  always `true`);
- is offered the upgrade path only when attempting a **4th cloud** canvas;
- keeps all **3 existing cloud canvases fully editable** — we never hold data
  hostage.

## Local-first is permanent

Startup behaviour must never change: `/` → editor, immediately. No login wall,
pricing modal, onboarding gate, template picker, cloud prompt, or account
requirement. Anonymous usage is first-class. There is **no permanent
monetization chrome on the canvas** — no persistent Pro badges, no Pro locks over
the toolbar, nothing that interrupts drawing or writing.

## Upgrade UX (future)

Prompts appear at genuine value moments, phrased around the benefit:

> ✅ "Sync this canvas across devices" · "Keep unlimited canvases in the cloud" ·
> "Export a transparent PNG" · "Access full version history"

Never: a startup pricing modal, a login wall, constant Pro badges, or locks over
core tools.

---

# Future architecture (design only — not implemented in 2.0)

## Authentication / subscription / entitlements are three layers

They are kept decoupled on purpose:

- **Authentication** answers _who the user is_.
- **Subscription** answers _what billing state Stripe reports_.
- **Entitlements** (`plans.ts`) answers _what a plan may do_.

Only entitlements exist today. The other two feed a `Plan` value into
entitlements later; entitlements never import them.

## Server-authoritative Pro status

**Never trust `localStorage`, React state, or any client claim as authoritative
Pro status.** When billing ships, a `"pro"` `Plan` must derive from
server-verified Stripe state:

- a Stripe **Customer** and **Subscription**, with monthly and annual **Price IDs**;
- subscription truth driven by **webhooks** (`active`, `past_due`, `canceled`,
  `cancel_at_period_end`, current-period end);
- the client may _cache_ a plan for UX, but any privileged action re-checks
  server state.

Do **not** integrate Stripe in this phase.

## Recommended backend

**Supabase** is the likely fit (auth + Postgres + row-level security + document
rows + sharing + storage), but the choice is not yet locked. Evaluate Supabase
vs. a minimal custom backend vs. staying purely on the current Next.js app before
committing. Recommend the smallest architecture that covers auth, cloud
documents, RLS, and sharing. Do **not** connect production services in 2.0.

## Cloud document storage strategy

Today a `CanvasDoc` is a single Fabric `toObject()` JSON blob persisted per page
in IndexedDB (see `src/lib/storage.ts`). Representative sizes (measured during
Phase 1.6H performance testing):

| Page type | Approx. serialized size |
|---|---|
| Simple notes (text + a few sticky notes) | a few KB |
| Drawing-heavy (≈300 freehand strokes + 100 nodes) | **≈1.4 MB** |
| Image-heavy (5 normalized photos) | **≈18 MB** (embedded data-URLs dominate) |

Images are embedded as base64 data-URLs, so image-heavy docs are large and would
be expensive to store as cloud versions. For future cloud sync, split storage
into three concerns rather than one blob:

1. **Canvas metadata** — id, title, timestamps, style, cloud/local ownership.
2. **Document JSON** — the vector/text content (small once images are extracted).
3. **Image assets** — stored/reference separately (see below).

Do **not** rewrite local persistence yet; local-first stays a single blob.

## Image asset strategy (future)

For cloud, extract embedded images into content-addressed **assets** and
reference them from the document JSON. Requirements:

- **backward compatible** — old docs with embedded data-URLs must still load;
- **deterministic references** — e.g. hash-based asset ids, so the same image
  isn't uploaded twice;
- **no silent data loss** on migration;
- **avoid repeated base64 uploads** and **avoid duplicating an image across every
  version-history snapshot** (the same risk the local history byte-cap addressed
  in 1.6H).

Design only.

## Version history (future)

Separate the frequently-autosaved **current document** from occasional **version
snapshots** created at meaningful intervals/events (not per keystroke). Retention:
Free ≈ **7 days**, Pro **long-term/unlimited**, with a retention-cleanup job.
Consider explicit user restore points. Do not implement now.

## Export entitlement architecture (future)

The current PNG/PDF export stays as the Free **Standard** tier and must **not** be
degraded to manufacture an upgrade. A future export menu reads entitlements:

- Free: `standardPNG`, `standardPDF`.
- Pro: `hdPNG`, 4K, `transparentPNG`, `svgExport`, `selectionExport`,
  `multiPagePDF`, `customExportSize`.

Do not build the new formats in 2.0.

## Sharing (future)

Permission roles: **owner · viewer · editor**. Free: limited public view links.
Pro: unlimited public view, private links, edit links, and collaboration when
built. No real-time collaboration in 2.0.

## AI (future)

No AI is built. The capability system already sizes a future monthly allowance
(`aiMonthlyActions`: Free small, Pro larger; the numbers in `plans.ts` are
illustrative until AI ships). Envisioned actions: organize thoughts, turn into a
mind map, make a flowchart, group ideas, clean up a diagram, summarize a canvas.
No AI UI now.

## Convert Files — the acquisition / growth layer (future)

A separate, **public, no-signup** traffic layer aimed at search acquisition,
running browser-side where practical:

```
PNG↔JPG · WebP→JPG/PNG · SVG→PNG · image compress · image resize ·
PNG/JPG→PDF · PDF→image · favicon
```

Flow: search → converter tool → **Download** or **"Open in NoteDrift"**. The
important architectural constraint for 2.0: **future auth must not force `/tools`
behind a login.** Public tools must remain possible. Do not implement converters
now, and do not add dead converter UI.

## Routing (future intent)

```
/                 NoteDrift editor   (instant, anonymous — never behind auth)
/tools            Convert Files landing (public, no signup)
/tools/[slug]     a specific converter (public)
/pricing          pricing
```

The editor stays at `/` — do **not** move it under `/app`. Opening
notedrift.com must remain instant editor access. No placeholder/dead routes are
added in 2.0.

## Analytics & privacy (future)

Product events + metadata only — **never** canvas text, drawing contents, image
contents, or document JSON. Anonymous local content stays on-device; cloud upload
happens only when a user explicitly chooses sync. Document content is never
inspected for advertising. Candidate events: `canvas_created`, `canvas_opened`,
`export_used`, `account_created`, `cloud_upload_attempted`, `cloud_limit_reached`,
`upgrade_viewed`, `checkout_started`, `subscription_started`,
`subscription_cancelled`, `convert_tool_opened`, `conversion_completed`,
`open_in_notedrift_clicked`. No analytics is installed in 2.0.

## Recommended implementation order

- **2.0A — Entitlements / product architecture** ← _this phase_
- **2.0B** — Auth / account foundation
- **2.0C** — Cloud canvas sync (3-cloud Free cap; local untouched)
- **2.0D** — Stripe billing + server-authoritative Pro state
- **2.0E** — Professional exports
- **2.0F** — Folders / version history / sharing

Separate growth track: **Convert Files** (`/tools`). Later: **AI**, then
**collaboration**. Change this order only with strong technical justification.
