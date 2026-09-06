# The Tool Factory — Operating Manual

*How NoteDrift ships free tools that rank, convert, and feed the ecosystem — without ever shipping a hollow keyword page.*

The Tool Factory is our repeatable pipeline for turning a search-intent idea into a genuinely useful, indexed, monetized tool. Every tool we ship is a real product first and an SEO asset second. The order is not negotiable.

**Free-tools positioning:** Useful tools. Fast. Private where technically true. No signup where possible.

This document is the source of truth for how a tool moves from a sticky-note idea to a 30-day review. If a decision isn't covered here, default to: *ship the useful thing, index nothing broken, and bridge every visitor back to Open. Think. Create.*

---

## The pipeline (stage-gate)

A tool advances through eleven states. Each arrow is a gate — the tool does not move until the gate's checklist is clean. Gates exist to stop us from indexing something half-built, not to slow us down. Most gates are minutes of work.

```
IDEA → SCORED → APPROVED → BUILD → QA → SEO QA → MONETIZATION QA
     → MARKETING READY → SHIPPED → 7-DAY REVIEW → 30-DAY REVIEW
```

### 1. IDEA
Raw candidate. One line: what a user types, and what they get back.
- [ ] The user's job is stated in their words ("combine two PDFs into one file"), not ours.
- [ ] The output is a file or a number the user can leave with — no dead ends.
- [ ] It plausibly runs in-browser or client-side (privacy-preserving, no upload) — flag it now if it can't.
- [ ] Logged in the Tool Factory backlog with a one-line rationale.

### 2. SCORED
Run the 0–5 rubric (below). This is a 10-minute judgment call, not a research project.
- [ ] All seven dimensions scored, with a one-line reason each.
- [ ] Search-intent volume marked **needs research (Search Console)** wherever a real number would drive the call. We score *direction*, not fabricated volume.
- [ ] Total recorded. Anything below the APPROVED threshold goes back to the backlog with a note, not the trash.

### 3. APPROVED
A human (founder or growth lead) commits to building it.
- [ ] Total score ≥ 24/35, **or** a written override explaining why we're building a lower-scored tool anyway (e.g. it completes a cluster).
- [ ] Route slug reserved (`/tools/<slug>`) and confirmed against the `/tools/[slug]` convention.
- [ ] Named ecosystem bridge decided up front: which existing surface (`/`, `/tools/edit-pdf`, image/audio tools) it cross-sells to.
- [ ] **Not yet in the sitemap. Not indexable.** Approval authorizes a build, not a live URL.

### 4. BUILD
Engineering. The route ships behind `noindex` until it passes QA.
- [ ] Core function works end-to-end on the three real inputs a user would actually bring.
- [ ] Client-side / private where we claim it. If any bytes leave the device, the copy must not say "private."
- [ ] No signup wall, no email gate, no "sign in to download."
- [ ] `robots noindex` present and canonical set to self — indexation stays off by default through the whole build.

### 5. QA (functional)
Does the tool do the job, on the hardware real users have?
- [ ] Works on desktop + mobile (tablet portrait included — we've regressed there before).
- [ ] Handles the ugly input: huge PDF, 200-page merge, empty file, wrong file type — graceful errors, no crash.
- [ ] Output is correct and downloadable in one click. File names are sane.
- [ ] Nothing in the console screams. No memory blow-ups on large files.

### 6. SEO QA
Now — and only now — we make it findable.
- [ ] Title + meta describe the *job*, match the intent, and read like a human wrote them.
- [ ] Structured data present and passing the Growth Engine 1 guard tests (no schema drift).
- [ ] Canonical correct; page added to the sitemap; `noindex` **removed**.
- [ ] Internal links in *and* out: the tool is linked from `/tools`, from its cluster siblings, and it links back to the ecosystem bridge.
- [ ] H1/on-page copy is genuine help, not keyword stuffing. If you'd be embarrassed to read it aloud, rewrite it.

### 7. MONETIZATION QA
Revenue is wired correctly and never at the expense of the free experience.
- [ ] Ads render only on the production host, never on localhost, via the tools ad provider (editor and tools use separate providers — confirm the tool uses the tools one).
- [ ] `adFree` entitlement fully suppresses ads for Pro. Verified logged-in as Pro.
- [ ] Ad eligibility is fail-safe: any uncertainty resolves to *no ad*, never a broken or intrusive one.
- [ ] Layout reserves the bottom band + inline units — no layout shift, no ad covering the tool's controls or the download button.
- [ ] Pro upsell (if any) is honest: ad-free + unlimited cloud + cross-device + pro exports, $3.99/mo or $29.99/yr. No fake scarcity, no dark pattern.

### 8. MARKETING READY
Assets exist so launch isn't a scramble.
- [ ] One-line and one-paragraph descriptions in brand voice, ready to reuse.
- [ ] Screenshot / short demo for social and the `/tools` card.
- [ ] Lifecycle email slot identified **only if** it fits an existing opt-in audience. Marketing email requires prior opt-in — never auto-opt-in anyone to announce a tool.
- [ ] Cross-link plan: which existing high-traffic pages get a link to the new tool.

### 9. SHIPPED
Live, indexable, monetized, linked. Record the ship date — the review clock starts here.
- [ ] Live URL confirmed indexable and in the sitemap.
- [ ] Submitted for indexing in Search Console.
- [ ] Ship date logged for the 7- and 30-day reviews.

### 10. 7-DAY REVIEW
Early read. Is it working and is it clean?
- [ ] Indexed yet? (Search Console coverage.) If not, why — thin content flag, crawl issue?
- [ ] Any error spikes, mobile complaints, or ad-layout problems?
- [ ] Real usage happening, or crickets? Note the *measured* number — do not estimate one we can't collect.
- [ ] Quick wins only: fix a broken input, tighten a title. No big rebuilds yet.

### 11. 30-DAY REVIEW
Verdict. Keep, improve, or de-prioritize.
- [ ] Search Console: impressions, clicks, position for the target queries (real data only).
- [ ] Does it bridge? Are visitors reaching the editor / Pro / sibling tools? (measured events, not vibes).
- [ ] Monetization: is it earning, and is Pro conversion from this surface non-zero?
- [ ] Decision recorded: double down (build the cluster around it), leave it running, or stop investing. Feed the learning back into SCORED for the next batch.

---

## The scoring rubric (0–5 per dimension)

Seven dimensions, 0–5 each, **35 max**. Score fast and honestly — this is a prioritization tool, not a grade. One-line reason per dimension is mandatory; a bare number is worthless in the backlog.

| # | Dimension | 0 | 5 |
|---|-----------|---|---|
| 1 | **Search-intent potential** | Nobody searches this; no clear query | Strong, specific, high-intent query people type constantly *(exact volume: needs research — Search Console)* |
| 2 | **Adjacency to current NoteDrift traffic** | Unrelated to anything we rank for | Sits right next to a page/cluster already drawing traffic (e.g. PDF editing) |
| 3 | **Product usefulness** | Gimmick; solves nothing real | Solves a real, recurring job better than the free alternatives |
| 4 | **Build complexity** *(inverted: 5 = simplest)* | Heavy, risky, multi-week, fragile | Trivial, client-side, done in a day |
| 5 | **Monetization potential** | No ad fit, no Pro hook | High-value page views and/or a clean pro-export / cloud Pro hook |
| 6 | **NoteDrift ecosystem bridge** | Dead-end; no reason to visit anything else | Natural hand-off to the editor, edit-pdf, or a sibling tool |
| 7 | **Internal-link strength** | Orphan page, nothing links to it | Slots into an existing cluster with links in *and* out |

**Bands**
- **28–35** — build next. Strong on intent *and* ecosystem.
- **24–27** — approved; queue it.
- **18–23** — parking lot. Build only to complete a cluster, with a written override.
- **< 18** — decline. Revisit only if search data changes the picture.

**Note on dimension 1:** the *score* is our directional judgment of intent quality. The *volume* behind it is always **needs research (Search Console)** until we've pulled real data. We never write a made-up monthly-search number into a scoring doc.

---

## Worked examples (from the Tool Factory 1 batch)

Three of the eight shipped tools, scored the way a real intake would look. Volumes are deliberately left as research items — the scores are qualitative judgments.

### Merge PDF (`/tools/merge-pdf`)

| Dimension | Score | Why |
|---|---|---|
| Search-intent | 5 | "merge pdf" is a canonical, high-intent converter query *(volume: needs research — Search Console)* |
| Adjacency | 5 | Sits directly beside `/tools/edit-pdf`, our shipped PDF surface |
| Usefulness | 5 | Combine, reorder, one download — a job people do constantly |
| Build complexity | 3 | In-browser PDF manipulation is real work, but well-trodden |
| Monetization | 4 | High-intent page views; clean pro-export upsell |
| Ecosystem bridge | 5 | Natural cross-sell to `/tools/edit-pdf` and the editor |
| Internal-link | 5 | Anchors the PDF cluster; links in and out to siblings |
| **Total** | **32/35** | Build-next tier. Flagship of the batch. |

### Word Counter (`/tools/word-counter`)

| Dimension | Score | Why |
|---|---|---|
| Search-intent | 5 | Enormous evergreen generic query *(volume: needs research — Search Console)* |
| Adjacency | 2 | Writing-adjacent, not PDF-adjacent; further from our current traffic |
| Usefulness | 5 | Instant words/chars/sentences/reading time — zero friction |
| Build complexity | 5 | Trivial, fully client-side, private by construction |
| Monetization | 3 | Big page volume for ads; weak direct Pro hook |
| Ecosystem bridge | 3 | Bridges to the editor for people who are actually writing |
| Internal-link | 3 | Standalone; needs deliberate linking to avoid orphaning |
| **Total** | **26/35** | Approved. Cheap to build, huge top-of-funnel; must be linked hard to the editor. |

### QR Code Generator (`/tools/qr-code-generator`)

| Dimension | Score | Why |
|---|---|---|
| Search-intent | 5 | Strong, specific, high-intent query *(volume: needs research — Search Console)* |
| Adjacency | 2 | Not in our PDF/writing clusters; a fresh entry point |
| Usefulness | 5 | Text/URL to QR, PNG download, no tracking — clean and honest |
| Build complexity | 4 | Simple client-side generation |
| Monetization | 3 | Good ad page; light Pro hook |
| Ecosystem bridge | 2 | Weakest bridge — easy to leave without touching anything else |
| Internal-link | 3 | Needs a "no tracking" angle and deliberate links to stay non-orphan |
| **Total** | **24/35** | Approved at the threshold. Green light *because* it opens a new intent doorway, on the condition we design its bridge — the 30-day review checks whether anyone crosses it. |

The contrast is the point: Merge PDF wins on ecosystem and cluster strength; Word Counter wins on cheapness and reach; QR Code wins on intent but must earn its bridge. The rubric surfaces exactly that trade-off instead of letting "it'll rank" decide everything.

---

## Two hard rules

### Never ship a fake keyword page

Every indexed route is a genuinely functional tool. Full stop.

We do not publish a page targeting "split pdf online" that half-works, funnels to a signup, or throws the user to a paid wall after the upload. If the tool doesn't do the job a searcher came for, the page doesn't exist. A thin page that ranks for a day and disappoints every visitor is worse than no page — it burns the query, the domain's trust, and the one shot we get with that user.

This is also why the rubric weights **usefulness** and **ecosystem bridge** as heavily as **search-intent**. We are building a product line that happens to rank, not a keyword farm that happens to run code.

### No indexation before functionality complete

A route is `noindex` from the first commit until it passes **QA** *and* **SEO QA**. Indexation is switched on exactly once — at the SEO QA gate — and never as a side effect of "it's on prod now."

Concretely:
- BUILD ships behind `noindex`, canonical-to-self.
- The `noindex` is removed **only** at SEO QA, after the tool works on real inputs, on mobile, with correct structured data and internal links.
- If we ever find an indexed route that fails QA, it goes back to `noindex` immediately — pulling a live URL is cheaper than letting a broken page define us in search results.

Google's memory is long and our brand is small. We only get to be "the site whose tools actually work" if that is true every single time. These two rules are how we keep it true.

---

## Operating notes

- **Batching.** Tools ship in themed batches (Tool Factory 1 = PDF + image + text utilities). Clusters rank better and link better than scattered one-offs — the rubric's adjacency and internal-link dimensions reward this on purpose.
- **Voice everywhere.** On-page copy, meta, and launch assets follow the NoteDrift voice: useful, smart, confident, a little playful, concise, human. No corporate jargon, no fake urgency, no "revolutionary." A tool page should feel like a sharp friend handing you the thing you needed.
- **Private where technically true.** We say "private" only when bytes never leave the device. If a tool must process server-side, the copy says what actually happens.
- **Measure what we can, invent nothing.** Reviews cite real Search Console and product-event data. Where we can't measure something, we write "not yet measurable" — never a plausible-sounding guess.
- **Email is opt-in only.** New-tool announcements go only to audiences who already opted in. We never auto-subscribe anyone to launch a feature.
