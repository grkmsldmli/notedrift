# NoteDrift — Product Model (Free / Pro)

> **Authoritative.** This document defines NoteDrift's business model and the
> architecture future phases must follow. When code and this document disagree,
> treat the disagreement as a bug. The machine-readable source of truth for
> capabilities and pricing is [`src/lib/plans.ts`](../src/lib/plans.ts); this
> document is its prose companion. Phase 2.0 established both. **Since then** these
> have shipped: the auth foundation (2.0B), **cloud canvas sync** with the
> server-enforced 3-cloud Free cap (2.0C), **Stripe + server-authoritative Pro
> billing** (2.0D — Pro = unlimited cloud canvases; see “Pro billing — shipped”
> below), and the separate Convert Files + PDF Editor growth track. Still **not
> built**: long-term version history, sharing / collaboration, professional
> exports, and AI. Sections still marked _(future)_ are design intent, not shipped
> features.

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
| Cloud sync | ❌ | ✅ | ✅ |
| Cloud canvas limit (server-enforced) | 0 | **3** | **∞** (Pro, via Stripe billing) |
| Version history _(future)_ | — | ~7 days | long-term / ∞ |
| Public view sharing _(future)_ | ❌ | limited | ✅ |
| Private sharing / collab _(future)_ | ❌ | ❌ | ✅ |
| Standard PNG export | ✅ | ✅ | ✅ |
| Standard single-page PDF _(entitlement; export not built yet)_ | ✅ | ✅ | ✅ |
| HD/4K/Transparent PNG, SVG, selection, multi-page PDF, custom size _(future)_ | ❌ | ❌ | ✅ |
| AI allowance _(future)_ | 0 | small | larger |
| Ads | none | none | none (always) |

### Free plan (canonical)

Everything in Phase 1.6 stays Free: Pen · Pencil · Marker · Highlighter · Brush ·
Technical Pen · Eraser · Shapes · Lines · Arrows · Diagrams · Text · Sticky notes ·
Images · Crop · Lasso · Group/Ungroup · Align/Distribute · Lock · Mind maps ·
Tool Library · Hand/navigation · paper backgrounds. Plus **unlimited local
canvases**, local autosave, no account required, and **Standard PNG** export
(shipped today). Standard single-page PDF is a Free entitlement too, but the PDF
export itself is **not built yet** — it ships in a later phase; a user can always
get their work out as PNG in the meantime.

The Free **cloud** plan is **shipped** (2.0C): up to **3 cloud canvases** (local
stays unlimited), the cap enforced **server-side** (never by client `plans.ts`).
Still _future_ on cloud docs: ~7-day version history, limited public view sharing,
and a small AI allowance. No ads.

### Pro plan (canonical)

Pro is **$3.99/month** or **$29.99/year** (see Pricing). Pro adds, **shipped in
2.0D**, **unlimited cloud canvases** (with the same cloud sync + device access as
Free, just without the 3-cap) and is always ad-free. Still _(future)_: advanced/
unlimited folders & notebooks; long-term/unlimited version history; unlimited
public sharing, private links, and collaboration; professional export (HD PNG,
4K PNG, transparent PNG, SVG, export selection, multi-page PDF, custom
dimensions); a larger AI allowance.

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

## Upgrade UX

The 2.0D entry points (account-menu "Upgrade to Pro", the at-limit cloud nudge,
and a compact Upgrade sheet) follow this; future prompts must too. Prompts appear
at genuine value moments, phrased around the benefit:

> ✅ "Sync this canvas across devices" · "Keep unlimited canvases in the cloud" ·
> "Export a transparent PNG" · "Access full version history"

Never: a startup pricing modal, a login wall, constant Pro badges, or locks over
core tools.

---

# Cloud canvas sync — shipped (Phase 2.0C)

Cloud sync is **live** and **local-first**. It never changes startup or local
behaviour; it is inert until a user, while signed in, explicitly chooses **Save to
cloud** on a canvas. The design notes in “Future architecture” below (cloud
document storage, image assets) are now **implemented** by this phase and kept
there only as rationale.

**Non-negotiable rules this phase enforces:**

- **Local save is independent of cloud.** The editor persists locally and only
  _then_ notifies the sync engine; any cloud failure (offline, error, conflict,
  cap) leaves local autosave untouched.
- **Signing in uploads nothing.** No local canvas is auto-uploaded on sign-in. A
  canvas becomes cloud-linked only via an explicit `saveToCloud`; edits then
  auto-sync (debounced, single-flight).
- **The 3-cloud Free cap is server-side.** Enforced inside a `SECURITY DEFINER`
  RPC under a per-user advisory lock — never by client `plans.ts`. Every
  authenticated account is currently treated as **Free** (no billing yet), so the
  effective cap is 3 for everyone. Local canvases stay unlimited.
- **No last-write-wins.** Updates are **optimistically revisioned**; a stale write
  becomes a **conflict**, resolved by the user. “Use cloud version” first preserves
  unsynced local work as a separate **local backup** page.
- **An account-A canvas never syncs under account B.** Each cloud link is bound to
  one owner uid and is never retargeted; RLS isolates rows per owner.

**Architecture (three concerns, not one blob):**

1. **Canvas metadata + document JSON** — `cloud_canvases` (owner-scoped, RLS,
   `revision`, `schema_version`). The document JSON stored in the cloud contains
   **no image data-URLs**.
2. **Content-addressed image assets** — images are extracted from the document,
   hashed (**SHA-256**), and stored once in a **private** `canvas-assets` storage
   bucket under an owner-id prefix; the document references them by hash
   (`ndasset:<sha>`). Deduplicated within and across canvases; hydrated back to
   data-URLs on open. Old local docs with embedded data-URLs still load.
3. **Asset references** — `cloud_canvas_asset_refs` ties a canvas to the assets it
   uses, so deleting a canvas can garbage-collect newly-orphaned assets.

Access is entirely through `SECURITY DEFINER` RPCs (`create` / `update` /
`delete` / `count`), with base-table GRANTs backing the RLS policies and **anon
fully denied**. Client code lives in `src/lib/cloud/` (`engine`, `client`,
`manifest`, `link`, `linkStore`); the UI is the compact `CloudButton` +
`CloudCanvasesDialog` (signed-in only — never shown to anonymous users).

**Still future on cloud docs** (not built here): version-history snapshots,
sharing / collaboration, professional exports, and AI. (Pro billing shipped in
2.0D — see “Pro billing — shipped”.)

---

# Pro billing — shipped (Phase 2.0D)

Pro is real: **Stripe-hosted checkout**, a **server-authoritative** subscription
record, and **verified webhooks** decide who is Pro. The only shipped Pro benefit
is **unlimited cloud canvases** (Free stays at 3). Every other Pro row in the
table above remains _(future)_. Pricing is unchanged (**$3.99/mo**, **$29.99/yr**),
derived from `PRICING` in `plans.ts`.

**Authority chain (never bypassable by the client):**

> Stripe subscription → signature-verified webhook (service role) →
> `billing_subscriptions.plan_key` → `is_pro()` → `create_cloud_canvas` cap → UI

**Non-negotiable rules this phase enforces:**

- **The client can never self-promote.** `plan="pro"` in the browser is
  display-only, read from the sanitized `get_billing_status()` RPC. The cloud cap
  re-checks `is_pro()` server-side, so a spoofed client plan grants nothing.
- **Billing rows are server-owned.** `billing_customers` / `billing_subscriptions`
  / `stripe_webhook_events` have RLS on with no anon/authenticated policies or
  grants — writes happen only via the service role (webhook/checkout) and the
  `service_role`-only apply RPC. A user can't read or mutate them; the only read
  path is their own sanitized status.
- **Approved-price allowlist.** A subscription grants Pro only if its Stripe Price
  is one of the two approved Pro prices (resolved from the configured monthly/
  yearly ids, which may be Price or Product ids). An unapproved price is never Pro,
  even if active — never product name / customer / email / metadata.
- **Checkout completion never grants Pro.** Only subscription lifecycle webhooks
  do. `active` / `trialing` (incl. the `cancel_at_period_end` window) = Pro;
  `past_due` / `unpaid` / `canceled` / `incomplete` / `paused` / unknown = Free
  (fail closed).
- **Idempotent + ordered.** The apply RPC dedupes by event id and ignores
  out-of-order (older) events, so retries and races can't corrupt state.
- **Non-destructive downgrade.** Losing Pro deletes/hides/disables nothing — a
  Free user with >3 cloud canvases keeps them all readable, editable and syncable;
  only NEW cloud creation is blocked while at/above the Free limit.

**Surfaces.** Server-only code (behind `server-only`) in `src/lib/billing/*`
(config, stripe, admin, prices, webhook) + routes `/api/billing/checkout`,
`/api/billing/portal`, `/api/stripe/webhook`. Client: `get_billing_status()` via
the browser Supabase RPC feeds `AuthProvider`; UX is the account menu (Upgrade to
Pro / Manage billing), a compact Upgrade sheet, plan-aware cloud UI, and an
"Activating Pro…" return state. Secrets never reach the client bundle. Billing
runs in an explicit, fail-closed **test/live mode** (`STRIPE_BILLING_MODE`, added
in Phase 3.0A): the Stripe key must match the mode, live additionally requires
`NODE_ENV=production` + a secure `https` origin, and every trusted Stripe
object/event's `livemode` must equal the configured mode. A mode-aware DB guard
(`billing_config.expected_livemode`) ensures a test subscription can never grant
production Pro. See [`docs/launch/`](launch/) for the production cutover.

**Still future for Pro** (not built here): professional exports, folders,
long-term version history, sharing / collaboration, expanded AI.

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

> **✅ Implemented in 2.0D** (see “Pro billing — shipped”). This section is kept as
> the principle the shipped design follows.

**Never trust `localStorage`, React state, or any client claim as authoritative
Pro status.** A `"pro"` `Plan` derives from server-verified Stripe state:

- a Stripe **Customer** and **Subscription**, with monthly and annual **Price IDs**;
- subscription truth driven by **webhooks** (`active`, `past_due`, `canceled`,
  `cancel_at_period_end`, current-period end);
- the client may _cache_ a plan for UX, but any privileged action (the cloud cap)
  re-checks server state.

## Recommended backend

**Supabase** is the likely fit (auth + Postgres + row-level security + document
rows + sharing + storage), but the choice is not yet locked. Evaluate Supabase
vs. a minimal custom backend vs. staying purely on the current Next.js app before
committing. Recommend the smallest architecture that covers auth, cloud
documents, RLS, and sharing. Do **not** connect production services in 2.0.

## Cloud document storage strategy

> **Implemented in 2.0C** (see “Cloud canvas sync — shipped”). The notes below are
> retained as the rationale the shipped design followed. Local persistence is
> still a single blob, as stated.

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

## Image asset strategy

> **Implemented in 2.0C** (content-addressed SHA-256 assets in a private bucket,
> deduped, hydrated on open; see “Cloud canvas sync — shipped”). Requirements
> below were the acceptance criteria and all hold.

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

Today only **Standard PNG** export ships (`exportPNG` in the controller); the
Free `standardPDF` entitlement exists but its export is **not built yet**. The
current PNG export stays as the Free **Standard** tier and must **not** be
degraded to manufacture an upgrade. A future export menu reads entitlements:

- Free: `standardPNG` (built), `standardPDF` (entitlement only, export TBD).
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

## Convert Files — the acquisition / growth layer (Free Tools Phase 1: shipped)

A separate, **public, no-signup, browser-side** traffic layer aimed at search
acquisition, under `/tools`. Flow: search → converter tool → **Download** (or
**Open NoteDrift**). Every conversion runs entirely in the browser — **no file
bytes ever leave the device** (no upload to our server, Supabase, analytics, or
any third-party API).

**Load-bearing policy — these tools are FREE acquisition utilities, not Pro
features:**

> **Basic file conversion, image compression, and image resizing are Free
> acquisition utilities, not Pro features.**

For Free Tools there is **no** signup, login, account requirement, conversion
credit, daily limit, watermark, reduced-quality tier, or payment gate.
Anonymous users get the exact same functionality as signed-in users, and
conversions never consume NoteDrift Pro / cloud entitlements. Free Tools are
**separate from NoteDrift Pro entitlements** (`plans.ts` is not consulted by any
converter). NoteDrift monetization stays with the editor's Pro workspace (cloud,
sync, history, sharing, professional NoteDrift exports, future AI), **never** the
converters.

**Shipped Phase-1 tools (10), all browser-side:** PNG→JPG · JPG→PNG · WebP→JPG ·
WebP→PNG · SVG→PNG · Compress Image (JPG/PNG/WebP) · Resize Image · JPG→PDF ·
PNG→PDF · PNG→ICO (valid multi-size 16/32/48 favicon). SVG is rendered only
through a sandboxed `<img>` path so embedded scripts never execute.

**Deferred (not shipped):** **PDF→PNG** and **PDF→JPG**. pdfjs (both v4 legacy and
v6, real worker and main-thread) reliably parses a PDF but **hangs at
`page.render()`** under the current Next 16 / Turbopack bundling — so shipping
them would mean shipping broken tools. They're deferred until that rendering path
is reliable (candidate fixes: a webpack build fallback for those routes, a
prebuilt worker asset, or a different rasterizer). `images→PDF` uses pdf-lib and
is unaffected. Also deferred for later phases: Office conversions, OCR,
video/audio, ZIP tools, and any server-side conversion.

Architectural constraint that still holds: **auth must never force `/tools`
behind a login** — the routes are public and statically generated.

## PDF Editor (`/tools/edit-pdf`) — shipped V1

A free, browser-side PDF editor. **Anonymous = full access.** No signup, no
watermark, no credits, no daily limit, no Pro lock. **PDF bytes never leave the
device** — rendering (self-hosted pdf.js), editing (Fabric.js overlays) and
export (pdf-lib) all run in the browser; the only network call while editing is a
same-origin fetch of a bundled font. `plans.ts` is never consulted.

**Shipped tools:** Select · Add Text · Pen · Highlight · Rectangle · Ellipse ·
Line · Arrow · Image · Whiteout/Cover · Signature (draw / type / upload).
**Page operations:** rotate, reorder (drag), duplicate, delete — undoable.
**Document:** thumbnails, page navigation, zoom, Fit Page / Fit Width, pan.
**Output:** **Download edited PDF** — the original PDF's text, vectors and images
are preserved (never whole-page rasterized) and the user's edits are drawn on top
as real vector content and real text. Added text exports as selectable PDF text
(StandardFonts for Latin/WinAnsi, Liberation Sans for Latin-extended, Greek and
Cyrillic; characters no bundled font covers are omitted, and that is surfaced).

**Explicit limitations (V1) — documented honestly:**

- **Whiteout is a cover, not secure redaction.** It places an opaque rectangle
  over content; the underlying source content is not removed. It is never called
  "redaction" or "permanent removal".
- **The source PDF's existing text cannot be directly edited.** The Text tool
  *adds* new text; it does not rewrite the original document's text.
- **No OCR.** Scanned/image PDFs are not made searchable.
- **No cloud save / no sync.** Editing is **ephemeral** — reloading or opening
  another PDF discards edits (a confirmation warns first). Nothing is uploaded.
- **Signature is a visual signature**, not a certified/legal digital signature.
- **Forms/annotations:** unchanged page order edits the original in place and
  preserves forms; page operations (reorder/rotate/delete/duplicate) rebuild
  pages via `copyPages`, which may not preserve interactive AcroForm fields.
- Safety bounds (not monetization): 100 MB, 500 pages, 4000px render edge, DPR 2.

The route is not behind auth and — like `/tools` — is public and indexable
(NOINDEX was removed only once the full editor shipped).

### Future PDF routes (documented intent only — NOT built)

Task-focused SEO landing pages are a later growth opportunity, to be built with
real, non-thin content when V1 is proven: `/tools/sign-pdf`,
`/tools/annotate-pdf`, `/tools/highlight-pdf`, `/tools/fill-pdf`,
`/tools/rotate-pdf`, `/tools/delete-pdf-pages`, `/tools/reorder-pdf-pages`,
`/tools/merge-pdf`, `/tools/split-pdf`. No thin/placeholder routes are added now.

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

- **2.0A — Entitlements / product architecture** — ✅ shipped
- **2.0B — Auth / account foundation** — ✅ shipped
- **2.0C — Cloud canvas sync** (3-cloud Free cap, server-enforced; local
  untouched) — ✅ shipped
- **2.0D — Stripe billing + server-authoritative Pro state** (Pro = unlimited
  cloud; non-destructive downgrade) — ✅ shipped
- **2.0E** — Professional exports ← _next_
- **2.0F** — Folders / version history / sharing

Separate growth track: **Convert Files** (`/tools`). Later: **AI**, then
**collaboration**. Change this order only with strong technical justification.
