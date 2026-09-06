# NoteDrift KPI Scorecard

The one-page instrument panel for growth. Every metric below has a **definition** and an **exact source**, so nobody argues about where a number came from. If a source is a dashboard, we read it there; if it's first-party, we say whether it's already flowing or still needs instrumentation.

**Reading rules**
- We do not guess. Any keyword or search-volume figure is marked **needs research (Search Console)** rather than invented.
- We only report what we can actually collect. Metrics we cannot yet measure are marked **needs instrumentation** — they belong on the roadmap, not in the weekly number.
- Marketing email metrics only exist because a user **opted in first**. We never auto-opt-in, and CRM numbers only ever count opted-in users.

**Source legend**
- **Search Console** — Google Search Console (search-side traffic and ranking)
- **AdSense** — Google AdSense dashboard (ad monetization)
- **NoteDrift** — our own app data. Tagged `collected` (already flowing) or `needs instrumentation` (event not yet fired)
- **Resend** — Resend email dashboard / webhooks (lifecycle + newsletter)
- **Supabase/Stripe** — Stripe-backed billing tables in Supabase, surfaced via `/api/admin/metrics`

---

## Acquisition

How many of the right people find the free tools and the editor.

| Metric | Definition | Source | Status |
|---|---|---|---|
| Search impressions | Times a NoteDrift URL appeared in Google results in the period | Search Console | Live in dashboard |
| Organic clicks | Clicks from Google search results to any NoteDrift page | Search Console | Live in dashboard |
| Search CTR | Organic clicks ÷ impressions | Search Console | Live in dashboard |
| Average position | Mean ranking position across queries (lower is better) | Search Console | Live in dashboard |
| Top-10 query count | Number of queries where our average position is ≤ 10 | Search Console | Live in dashboard |
| Organic sessions | Visits that begin from an organic search entrance | NoteDrift — **needs instrumentation** (no analytics installed) | Use Search Console **organic clicks** as the interim proxy |

Notes:
- Per-tool acquisition (e.g. "how is /tools/merge-pdf ranking?") comes from filtering Search Console by page. Track the 8 Tool Factory pages plus /tools/edit-pdf, image-compressor, image-resizer, and the editor.
- Any target keyword's search volume is **needs research (Search Console)** — pull the real query, don't estimate.
- "Organic sessions" needs a privacy-respecting analytics layer to be exact. Until then, organic clicks is the honest stand-in and we label it as such.

---

## Product

Whether the tools actually do the job once someone lands.

| Metric | Definition | Source | Status |
|---|---|---|---|
| Tool starts | User begins a task in a tool (e.g. drops a PDF into Merge, types into Word Counter) | NoteDrift — **needs instrumentation** | Not collected yet |
| Successful completions | User reaches a valid result state (merged file ready, QR rendered, count shown) | NoteDrift — **needs instrumentation** | Not collected yet |
| Download / result actions | User takes the payoff action (download PDF/JPG/PNG, copy result) | NoteDrift — **needs instrumentation** | Not collected yet |
| Error rate | Share of starts that hit a handled error (bad file, unsupported format, decode failure) | NoteDrift — **needs instrumentation** | Not collected yet |

Notes:
- **The entire Product row is uninstrumented today.** These tools run in-browser and private by design, so nothing is logged server-side. Measuring them means adding a lightweight, privacy-respecting client event (start / complete / download / error) per tool — no file contents, no PII, just the event. This is the single highest-leverage instrumentation task on the roadmap: without it we're flying blind on the funnel between "found the tool" and "loved the tool."
- Define one shared event shape across all 8 tools so completion rate is comparable tool-to-tool (merge-pdf, split-pdf, extract-pdf-pages, pdf-to-jpg, crop-image, qr-code-generator, word-counter, signature-maker).

---

## Monetization

What the free traffic and the upgrade path are worth.

| Metric | Definition | Source | Status |
|---|---|---|---|
| AdSense page RPM | Estimated ad revenue per 1,000 page views | AdSense | Live in dashboard |
| Ad revenue per tool | Ad earnings attributed to each tool page | AdSense (URL channels / custom channels per tool page) | Needs AdSense channels configured per tool page |
| Pro CTA click | User clicks an upgrade / Pro call-to-action (e.g. UpgradeDialog, signature-maker cross-sell) | NoteDrift — **needs instrumentation** | Not collected yet |
| Pro conversion (where attributable) | Share of Pro CTA clicks (or tool sessions) that complete a Stripe checkout | Supabase/Stripe for the conversion; NoteDrift — **needs instrumentation** for the source that makes it attributable | Conversions are counted; attribution to a tool/CTA needs an event + checkout metadata |

Notes:
- Ads only serve on the production host and never on localhost, and never to `adFree` Pro users — so RPM reflects free traffic only. That's expected.
- "Pro conversion where attributable" is deliberately hedged: we can always see that a checkout happened (Stripe), but we can only attribute it to a tool or CTA if we tag the Pro CTA click and carry a source into the Stripe checkout. Without that, report Pro conversions as a total, not per-source, and don't pretend otherwise.

---

## CRM

The owned audience — people we can reach again, with permission.

| Metric | Definition | Source | Status |
|---|---|---|---|
| Marketing opt-in | Count of users who explicitly opted in to marketing email | Supabase/Stripe via `/api/admin/metrics` (`marketingOptInCount`, from `email_preferences`) | Collected |
| Newsletter click | Clicks on links inside a sent lifecycle/newsletter email | Resend | Live once email is activated (needs `RESEND_API_KEY`) |
| Return visit | A known/returning visitor comes back in the period | NoteDrift — **needs instrumentation** (no analytics installed) | Not collected yet |

Notes:
- Every CRM number counts **opted-in users only**. We do not email people who didn't ask, and we never infer consent.
- Newsletter open rate is intentionally omitted — open tracking is unreliable and conflicts with our privacy posture. Judge email on **clicks**, not opens.
- "Return visit" needs the same analytics layer as organic sessions. Until it exists, treat it as a roadmap metric, not a reported one.

---

## Business

The bottom line. These are the numbers that decide whether the model works.

| Metric | Definition | Source | Status |
|---|---|---|---|
| Active Pro | Count of active/trialing Pro subscriptions in the live billing mode | Supabase/Stripe via `/api/admin/metrics` (`activeProSubscriptions`, plus `byInterval` monthly/yearly split) | Collected |
| MRR | Monthly recurring revenue, normalized across monthly ($3.99) and yearly ($29.99) plans | Supabase/Stripe via `/api/admin/metrics` (`mrrUsd`) | Collected |
| ARR | Annual recurring revenue (MRR × 12, normalized) | Supabase/Stripe via `/api/admin/metrics` (`arrUsd`) | Collected |

Notes:
- **MRR, ARR, Active Pro, and the marketing opt-in count all come from the existing `/api/admin/metrics` endpoint.** It's owner-only (Bearer `ADMIN_METRICS_SECRET`), returns 501 until that secret is set, and only counts subscriptions matching the configured live/test billing mode — so test rows never inflate production MRR. It also returns `indexedToolPages` and the monthly/yearly interval mix.
- This is the one endpoint a founder can hit weekly to get every owned business number in one JSON response. No spreadsheet math required.

---

## Weekly review — 8 headline numbers

Fill this in every Monday. If a cell can't be filled honestly, write the status (e.g. "needs instrumentation") rather than a guess.

| # | Metric | This week | Last week | Δ | Source |
|---|---|---|---|---|---|
| 1 | Search impressions | | | | Search Console |
| 2 | Organic clicks | | | | Search Console |
| 3 | Search CTR | | | | Search Console |
| 4 | Top-10 query count | | | | Search Console |
| 5 | AdSense page RPM | | | | AdSense |
| 6 | Ad revenue (total) | | | | AdSense |
| 7 | Active Pro | | | | `/api/admin/metrics` |
| 8 | MRR | | | | `/api/admin/metrics` |

**How to read the week:** rows 1–4 tell you if the top of the funnel is growing; 5–6 tell you what today's free traffic is worth; 7–8 tell you if any of it is turning into a business. When Product instrumentation lands, promote completion rate into this table — it's the missing link between "traffic grew" and "revenue grew."

---

## Roadmap to a complete scorecard

Priority order for closing the gaps, highest leverage first:

1. **Instrument the 8 tools** — shared start / complete / download / error events (privacy-respecting, no file contents). Unlocks the entire Product row and makes completion the headline health metric.
2. **Instrument the Pro CTA** — tag CTA clicks and carry a source into Stripe checkout, so "Pro conversion where attributable" becomes real per-tool.
3. **Add a privacy-respecting analytics layer** — unlocks organic sessions and return visits without compromising the "private where technically true" positioning.
4. **Configure AdSense per-tool channels** — turns "ad revenue per tool" from estimate into fact.
5. **Activate email** (`RESEND_API_KEY`) — turns newsletter clicks on.

Until each lands, its metrics stay honestly labeled. An empty-but-honest cell beats a confident-but-invented one.
