# NoteDrift Growth OS

This is how NoteDrift runs growth with one person acting like a six-person team. No headcount, no bureaucracy — six **virtual functions**, a fixed weekly rhythm, and a review loop that tells us whether each tool earns its keep.

The whole system exists to compound one motion: ship a genuinely useful free tool, get it indexed and found, let ads + Pro pay for it, and pull a slice of those users deeper into the ecosystem (editor, `/tools/edit-pdf`, Pro). Everything below serves that loop.

**Operating principle:** every week, one tool gets the full pipeline. Small, repeatable, measured. We don't launch — we operate.

---

## The six functions

Each function is a hat, not a hire. On any given day you wear one at a time. The point of naming them is that each owns a clear mission, cadence, artifacts, and a **definition of done** so nothing gets half-shipped.

### 1. PRODUCT — tool quality

**Mission:** Every tool is fast, obviously useful, and does the job with no signup and no friction. Private where technically true (in-browser, nothing uploaded) — and we say so plainly, never more than is true.

**Weekly cadence:** Own the tool-of-the-week's UX pass (Mon–Tue). Triage any real usability issues surfaced by the 7-day review. Keep the cross-sell paths honest (e.g. signature-maker → `/tools/edit-pdf`).

**Key artifacts:**
- Per-tool spec: what it does, input/output, the one-line promise, empty state, error states.
- Cross-sell map: which tool points to which ecosystem surface, and why it's genuinely helpful there.
- Known-issues list (bugs + friction), ranked.

**Definition of done:**
- [ ] Works on a real file/input on desktop and mobile.
- [ ] Loads fast; no layout shift; clear result + one obvious next action (download / copy / go to editor).
- [ ] Privacy claim matches reality (if it's in-browser, say in-browser; if something touches a server, don't imply it doesn't).
- [ ] Title, H1, and meta describe the actual job a searcher is trying to do.

### 2. SEO — organic acquisition

**Mission:** Be the top result for the specific job each tool does. Organic search is our primary, lowest-cost acquisition channel — win it deliberately.

**Weekly cadence:** Monday query review in Search Console (see rhythm below). Confirm the week's tool is submitted/indexed. Fix crawl or structured-data errors as they appear.

**Key artifacts:**
- Per-tool target query set. Where a volume/difficulty number would go, write **"needs research (Search Console)"** — we do not invent search volumes.
- Indexing checklist: in sitemap, submitted, structured data valid, canonical correct.
- Internal-link plan: how each new tool links to and from siblings and the editor.

**Definition of done:**
- [ ] Page is indexable, in the sitemap, and submitted.
- [ ] Structured data validates with no errors.
- [ ] Unique, job-shaped title + meta; H1 matches intent.
- [ ] At least two internal links in, two out, all relevant.
- [ ] Baseline captured in Search Console so the 7- and 30-day reviews have something to compare against.

### 3. MONETIZATION — AdSense + Pro funnel

**Mission:** Make the free tools pay for themselves via AdSense, and convert the small, right slice of users to Pro (ad-free + unlimited cloud + cross-device + pro exports — $3.99/mo or $29.99/yr) without a single dark pattern.

**Weekly cadence:** Check that ad units render only where they should (prod host only, never localhost), respect the `adFree` entitlement, and never block or crowd the actual tool. Review Pro touchpoints on the week's tool.

**Key artifacts:**
- Ad placement map per tool: reserved bottom band + any inline unit, with the rule that the tool result always comes first.
- Pro value moments: the honest points where Pro genuinely helps (cloud save, cross-device, bigger/pro exports) — not nag walls.
- Funnel notes: which tools send the most engaged users toward Pro.

**Definition of done:**
- [ ] Ads render on prod only, respect `adFree`, and never obscure or delay the result.
- [ ] Pro is offered at a real value moment, framed as an upgrade, never as a toll gate on the free job.
- [ ] No fake urgency, no fake scarcity, no confusing cancel path.
- [ ] RPM and Pro clicks are measurable for this tool (don't guess them — read them).

### 4. CRM — lifecycle / Resend

**Mission:** Turn one-time tool users into people who come back, using the Resend lifecycle engine — and only with people who asked to hear from us.

**Weekly cadence:** Decide Thursday whether there is a **newsletter block worth sending** (real, useful content) **and** an opted-in audience to send it to. If either is false, we don't send. Keep triggers and unsubscribe clean.

**Key artifacts:**
- Lifecycle map: which template fires on which real event, and why it's useful to the recipient.
- Opt-in ledger: who opted in, where, when. **Marketing email requires prior opt-in — we never auto-opt-in anyone**, ever, for any reason.
- Newsletter block backlog: reusable "here's a tool + how to use it" segments.

**Definition of done:**
- [ ] Every recipient explicitly opted in; unsubscribe is one click and honored immediately.
- [ ] The email teaches or helps — if it's just "we exist," it doesn't go out.
- [ ] Trigger fires on a real event, not a manufactured one.
- [ ] Send is gated on **real useful content AND an opted-in list** — both, or it waits.

### 5. CREATIVE — campaigns / social / email creative

**Mission:** Make the work look as good as it is. Clean, confident, slightly playful, unmistakably NoteDrift. "Open. Think. Create." for the ecosystem; "Useful tools. Fast. Private where technically true. No signup where possible." for the tools.

**Weekly cadence:** Produce the tool-of-the-week's short demo (Tue) and the "tool of the week" social post (Wed). Design any newsletter block Creative-side (Thu, only if CRM greenlights a send).

**Key artifacts:**
- Demo clip: 10–20s, real tool doing the real job, one clear payoff.
- Social post: one tool, one job, one line, one link. No thread of hype.
- Reusable visual kit: consistent type, spacing, and color so every post reads as one brand.

**Definition of done:**
- [ ] Shows the tool actually working, not a mockup of a promise.
- [ ] Copy is concise and human — no "revolutionary," "game-changing," "disrupt," no jargon, no emoji spam.
- [ ] Links to the live tool; the claim in the creative matches what the tool does.
- [ ] Looks visually clean at a glance on a phone.

### 6. ANALYTICS — measurement + weekly reporting

**Mission:** Tell the truth about what's working with numbers we can actually collect. Own the Friday measure and the per-tool 7/30-day reviews.

**Weekly cadence:** Friday — pull the week's numbers, run the 7-day review on the current tool and any 30-day review that comes due, and write the one-screen weekly report.

**Key artifacts:**
- Weekly report: what shipped, what moved, what's decided next — one screen.
- Per-tool review log (7-day + 30-day) with the recorded decision.
- Metrics we can honestly collect: Search Console (impressions, clicks, queries, position), tool usage/events, AdSense RPM, ecosystem clicks, opt-ins. **If we can't collect it, we don't report it — no fabricated metrics.**

**Definition of done:**
- [ ] Every number is a real, sourced metric (or marked "needs research (Search Console)").
- [ ] Each due review ends in an explicit decision: SCALE / IMPROVE / MAINTAIN / DEPRIORITIZE.
- [ ] The report fits on one screen and names next week's tool.

---

## Operating rhythm — Tool of the Week

One tool through the full pipeline each week. The eight Tool Factory tools rotate first (merge-pdf, split-pdf, extract-pdf-pages, pdf-to-jpg, crop-image, qr-code-generator, word-counter, signature-maker), then re-enter the rotation as they earn IMPROVE/SCALE work.

| Day | Function | Do |
|-----|----------|----|
| **Mon** | SEO | Search Console query review. Confirm the week's tool is indexed and error-free. Lock its target query set (mark unknowns "needs research (Search Console)"). |
| **Tue** | Product + Creative | Final UX pass. Record the short demo — real tool, real job. |
| **Wed** | Creative | Publish the "tool of the week" social post: one tool, one job, one line, one link. |
| **Thu** | CRM | Newsletter block **only if** there's real useful content **and** an opted-in audience. Otherwise, skip — no send. |
| **Fri** | Analytics | Measure. Run the 7-day review on this tool + any due 30-day review. Write the one-screen weekly report and name next week's tool. |

The rhythm is the product. Missing a demo is fine; breaking the loop is not.

---

## Per-tool reviews

Every tool gets two scheduled checkpoints. They are short, honest, and end in a decision.

### 7-DAY review — "Is it findable and does it work?"

Run on Day 7. Early signal only; don't over-read it.

| Check | What to record | Source |
|-------|----------------|--------|
| Indexing status | Indexed? In sitemap? Canonical correct? | Search Console |
| Impressions | Is it appearing in search at all yet? | Search Console |
| Errors | Crawl, structured-data, or console errors? | Search Console / logs |
| Usability | Real desktop + mobile run: does the job complete cleanly? | Manual |
| Early queries | Which actual queries surfaced it (even if tiny)? | Search Console |

**Output:** short note — is it in the index, is it usable, are there blockers to fix before Day 30? Fix blockers now.

### 30-DAY review — "Does it earn its place?"

Run on Day 30. Enough signal to decide.

| Metric | What to record | Source |
|--------|----------------|--------|
| Clicks | Organic clicks over the period | Search Console |
| Rankings | Positions for target queries (trend, not vanity) | Search Console |
| Usage | Tool completions / events | Product analytics |
| RPM | Ad revenue per thousand — read it, never estimate | AdSense |
| Ecosystem clicks | Clicks into editor / `/tools/edit-pdf` / Pro from this tool | Product analytics |
| Opt-in | New opt-ins attributable to this tool (opt-in only) | CRM |

**Decision (pick one, record it):**
- **SCALE** — real demand + real value. Add adjacent variants, deepen internal links, feature it again, sharpen the cross-sell.
- **IMPROVE** — demand exists but something leaks (weak ranking, thin UX, low ecosystem pull). Fix the specific gap, re-review in 30.
- **MAINTAIN** — quietly useful, low upkeep. Leave it working; don't invest.
- **DEPRIORITIZE** — little demand, little value, no ecosystem pull. Stop spending attention; keep it live only if upkeep is near-zero.

Where a number genuinely isn't collectable yet, write **"needs research (Search Console)"** or "not yet measurable" — never a guess.

---

## International expansion — NOT YET

**English wins first.** We have eight tools, a rhythm to prove, and a domestic search surface we haven't saturated. Spreading thin across languages before we've won English is a distraction.

**When we revisit, it's driven by evidence, not ambition:** real Search Console geography showing meaningful non-English impressions and clicks pulling on specific tools. That data decides where — and whether — we go.

**And when we do, we do it properly:** genuinely translated UI **and** content, correct `hreflang`, native-quality copy for each market. **Never mass machine-translation** dumped across the site — it's bad for users, bad for search, and off-brand. One market done right beats ten done cheaply.

Until the geography data says otherwise: park it. Focus is the strategy.

---

*The goal of this document is simple: operate like a larger organization without any of the overhead of one. Six hats, one weekly loop, honest numbers, and a decision at the end of every tool's month.*
