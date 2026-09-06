# Experiment Backlog

A lightweight, running list of growth experiments for NoteDrift. Every idea worth testing gets a row here before anyone touches production. This is the source of truth for what we're testing, why, and what we decided.

## How to use this

1. Add a candidate as a new record with **Status: Proposed**.
2. Before it runs, fill in Hypothesis, Surface, Primary KPI, Guardrail, and the decision thresholds. Call the shot *before* you look at data.
3. Move it to **Ready** when instrumentation exists, then **Running** when live.
4. When it ends, fill in Result and Decision. Ship it, kill it, or iterate.

## Rules

- **One experiment = one meaningful variable.** Testing copy *and* placement at once is two experiments (or one clearly-scoped treatment that ships or dies as a single unit — never a confound you can't read).
- **Every experiment has a guardrail.** Nothing ships if it moves the KPI by harming tool completion, raising bounce, or degrading the free-tool promise.
- **No dark patterns.** No fake urgency or scarcity, no forced signup, no gating a free action behind a nudge, no pre-checked opt-ins. Marketing email only goes to people who opted in — never auto-opt-in.
- **Privacy is a guardrail on the method, not just the product.** Experiment assignment must be anonymous and local (deterministic bucketing on an anonymous client id, aggregate counts only, no new cross-site tracking). "Private where technically true" has to survive the test harness itself.
- **Set stop rules up front.** Define runtime and sample thresholds before starting; don't peek-and-stop on day one. Concrete thresholds depend on current traffic per surface — needs research (Search Console / analytics baseline).

## Experiment record schema

| Field | Meaning |
|---|---|
| **ID** | Unique key, `EXP-NNN`. |
| **Hypothesis** | "We believe [change] causes [effect] because [reason], measured by [KPI]." |
| **Surface** | Exact page, module, or email where it runs. |
| **Primary KPI** | The single metric that decides the outcome. |
| **Guardrail** | Metric(s) that must not regress for a win to count. |
| **Status** | Proposed → Ready → Running → Analyzing → Shipped / Killed / Parked. |
| **Start** | Date the treatment goes live. |
| **End** | Date or stop rule (whichever comes first). |
| **Result** | Measured outcome vs. control (filled post-hoc). |
| **Decision** | Ship / Kill / Iterate + one-line rationale (filled post-hoc). |

---

## Backlog

### EXP-001 — Benefit-led SEO title + H1 on Merge PDF

- **Hypothesis:** Rewriting the Merge PDF `<title>` and H1 from a generic label to a benefit-led, no-signup framing ("Merge PDF — combine files in your browser, free, no signup") raises organic click-through from search, because the promise (free, in-browser, private) is exactly what these searchers are screening for.
- **Surface:** `/tools/merge-pdf` — page title tag + hero H1.
- **Primary KPI:** Organic CTR for the page's queries (Search Console).
- **Guardrail:** No drop in average position; no drop in tool completion rate (merge → download).
- **Status:** Proposed · **Start:** TBD · **End:** 4–6 week window after indexing.
- **Mechanism:** Sequential before/after — Google renders one title, so this is *not* a per-user A/B and needs no harness. Requires a clean Search Console baseline first. Query volume for these terms needs research (Search Console).
- **Result:** — · **Decision:** —

### EXP-002 — Related-tools ordering: task-adjacency vs. alphabetical

- **Hypothesis:** Ordering the related-tools module by likely next step (Merge PDF → Split PDF, Extract Pages, Edit PDF) instead of alphabetically increases secondary-tool clickthrough and tools-per-session, because we're surfacing the actual next job instead of an arbitrary list.
- **Surface:** Related-tools module on PDF tool pages.
- **Primary KPI:** Related-tools CTR (and tools-per-session as a secondary read).
- **Guardrail:** No drop in primary tool completion; no rise in bounce on the host page.
- **Status:** Proposed · **Start:** TBD · **End:** TBD (run to threshold; needs research).
- **Mechanism:** **Needs test harness** — per-user bucketing + module-click instrumentation don't exist yet.
- **Result:** — · **Decision:** —

### EXP-003 — Above-the-fold outcome copy on Crop Image

- **Hypothesis:** Leading the hero with the concrete, private outcome ("Crop JPG, PNG, or WebP to the exact ratio you need — right here, nothing uploaded") instead of a generic tool description raises the tool **start rate** (a file actually gets loaded), because it removes the "will this upload my photo?" hesitation before the first action.
- **Surface:** `/tools/crop-image` — above-the-fold hero copy.
- **Primary KPI:** Tool start rate (file loaded ÷ page views).
- **Guardrail:** No rise in bounce; no drop in completion (crop → download) among those who start.
- **Status:** Proposed · **Start:** TBD · **End:** TBD (run to threshold; needs research).
- **Mechanism:** **Needs test harness** — copy-variant assignment + a "file loaded" event both need building.
- **Result:** — · **Decision:** —

### EXP-004 — Pro contextual CTA: value-at-the-moment vs. persistent header

- **Hypothesis:** A value-framed Pro nudge shown *after* a successful free action, at a genuinely Pro-relevant moment ("Want this saved across your devices? That's Pro."), converts better than the always-on header CTA, because it lands when the benefit is concrete instead of abstract.
- **Surface:** Post-export success state on PDF to JPG / Merge PDF.
- **Primary KPI:** Pro CTA → checkout-start rate.
- **Guardrail:** No drop in free tool completion; no rise in bounce; the free action must stay fully unblocked (no gating — hard no-dark-pattern line).
- **Status:** Proposed · **Start:** TBD · **End:** TBD (run to checkout-start threshold; needs research).
- **Mechanism:** **Needs test harness** — variant assignment + CTA-impression/click/checkout-start funnel events.
- **Result:** — · **Decision:** —

### EXP-005 — Newsletter subject line: specific benefit vs. curiosity

- **Hypothesis:** A specific-benefit subject line beats a curiosity-gap subject on open rate without raising unsubscribes, because our list opted in for useful tools, not teasing.
- **Surface:** Lifecycle email (Resend), one send to the opted-in list.
- **Primary KPI:** Open rate.
- **Guardrail:** Unsubscribe rate must not rise above baseline; spam-complaint rate flat. Send **only** to prior opt-ins — no auto-opt-in.
- **Status:** Proposed · **Start:** TBD · **End:** single send + 48h read.
- **Mechanism:** **Partial / manual split** — Resend has no native subject A/B, so split the list into two random arms and send both, then compare. A reusable split-send + open-tracking helper is a small lift; mark **needs test harness (lightweight)** if we want this repeatable.
- **Result:** — · **Decision:** —

### EXP-006 — Cross-sell CTA wording: Signature Maker → Edit PDF

- **Hypothesis:** An action-oriented cross-sell on the signature export success state ("Add this signature to a PDF →") beats a generic "Try our PDF editor," because it names the exact next job the user is likely there for.
- **Surface:** Signature Maker post-export success state → `/tools/edit-pdf`.
- **Primary KPI:** Cross-sell CTR to Edit PDF (with downstream Edit-PDF start rate as the confirming read).
- **Guardrail:** No drop in signature export completion; no rise in bounce on the signature page.
- **Status:** Proposed · **Start:** TBD · **End:** TBD (run to CTR threshold; needs research).
- **Mechanism:** **Needs test harness** — variant assignment + cross-sell click event + downstream attribution.
- **Result:** — · **Decision:** —

### EXP-007 — Explicit "no tracking, in your browser" trust line on QR Code Generator

- **Hypothesis:** Stating the privacy promise plainly next to the generate/download control ("Generated in your browser. No tracking, no logging.") raises the QR **download rate**, because these users are choosing us over trackable alternatives and the reassurance closes the loop at the decision point.
- **Surface:** `/tools/qr-code-generator` — copy adjacent to the generate/download button.
- **Primary KPI:** QR download rate (download ÷ generate).
- **Guardrail:** No rise in bounce; the claim must stay literally true (it is — no tracking is added).
- **Status:** Proposed · **Start:** TBD · **End:** TBD (run to threshold; needs research).
- **Mechanism:** **Needs test harness** — variant assignment + generate/download events.
- **Result:** — · **Decision:** —

### EXP-008 — Contextual editor cross-sell on Word Counter

- **Hypothesis:** Offering "Draft this in NoteDrift's editor →" to users who paste longer text into Word Counter increases editor visits, because a long paste is a signal they're mid-writing and could use a canvas, not just a counter.
- **Surface:** Word Counter results panel (shown above a length threshold).
- **Primary KPI:** Editor CTA CTR from Word Counter.
- **Guardrail:** No drop in Word Counter usefulness signals (time-on-tool / repeat paste); no rise in bounce.
- **Status:** Proposed · **Start:** TBD · **End:** TBD (run to threshold; needs research).
- **Mechanism:** **Needs test harness** — variant assignment, a paste-length trigger, and a CTA-click event.
- **Result:** — · **Decision:** —

---

## Test-harness gap

Six of the eight experiments (EXP-002, 003, 004, 006, 007, 008) can't run until we have a **lightweight client-side experiment harness**. EXP-005 needs only a small manual/`split-send` helper; EXP-001 needs no harness at all (sequential SEO test).

What the harness needs, and the privacy constraints it must respect:

- **Deterministic anonymous assignment** — bucket on a locally generated, non-identifying client id so a visitor sees a stable variant within a session. No PII, no server-side profile, no cross-site identifier. If it can't be done without adding tracking that breaks "private where technically true," it doesn't ship.
- **Event instrumentation for the KPIs above** — most of these KPIs (tool start, tool completion, CTA impression/click, downstream tool start) are not currently collected. Each experiment's KPI and guardrail depend on those events existing and being aggregated as counts only.
- **A simple results readout** — per-arm KPI and guardrail metrics with enough context to call ship/kill. Decision and sample thresholds get set from real per-surface baselines before launch — those baselines need research (Search Console / analytics).

Until the harness exists, keep adding candidates here as **Proposed** and prioritize by expected value ÷ build cost. EXP-001 (SEO, no harness) and EXP-005 (email split) are the two we can start without engineering a bucketing system.
