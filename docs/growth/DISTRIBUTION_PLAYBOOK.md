# NoteDrift Distribution Playbook

*Internal operating doc — how we get NoteDrift and the free tools in front of people. Value-first, no spam, no fake accounts, every community's rules respected. If a tactic only works because nobody's watching, we don't run it.*

**Positioning to lead with:** Open. Think. Create. For the free tools: *Useful tools. Fast. Private where technically true. No signup where possible.*

---

## Ground rules (read once, apply to every channel)

- **Value before ask.** Post the useful thing first. The link is a footnote, not the point.
- **No automation that impersonates a human.** No bot comment farms, no fake accounts, no upvote rings, no scheduled reply spam. Scheduling *our own* posts is fine.
- **Respect the house rules.** Every subreddit, forum, and directory has a self-promo policy. Read it before posting. When in doubt, ask a mod.
- **One honest claim only.** "Private where technically true" means: the client-side tools that never upload get called private; the ones that touch our servers don't. Never blur that line to sound better.
- **No dark patterns anywhere** — not in a post, not in a headline, not in an email subject. No fake urgency, no fake scarcity.
- **Marketing email is opt-in only.** We never add someone to a marketing list because they used a tool or created an account. Transactional ≠ marketing.

---

## The tracking standard (used by every channel below)

Everything measurable routes through four systems. When a channel section says "tag with UTMs," this is the shape.

**UTM convention (lowercase, hyphenated, no spaces):**

`?utm_source={platform}&utm_medium={type}&utm_campaign={initiative}&utm_content={variant}`

- `utm_source` — `reddit`, `producthunt`, `hn`, `x`, `linkedin`, `youtube`, `tiktok`, `newsletter`, `directory-name`
- `utm_medium` — `social`, `post`, `comment`, `email`, `referral`, `video-desc`
- `utm_campaign` — the initiative, e.g. `merge-pdf-launch`, `tf1-directories`, `ph-tool-factory`
- `utm_content` — the specific variant/link so we can tell two posts apart

**Where the numbers live:**

1. **UTMs → first-party analytics.** Landing URL, source, and downstream behavior (did they use the tool? open the editor? hit the Pro page?). This is the only place we see *what a click did*, not just that it happened.
2. **Google Search Console.** The truth source for organic — queries, impressions, position, CTR per page. Any search-volume or ranking claim comes from here, never from memory or a guess.
3. **AdSense.** Revenue and RPM per page/tool. Tells us which traffic actually monetizes (relevant because ads are off on localhost and gated to prod hosts).
4. **First-party product events.** Tool usage, editor opens, Pro conversions, email opt-ins. The conversion end of the funnel.

**Rule:** if we can't collect a metric first-party or from Search Console/AdSense, we don't report it. No estimated reach, no invented impressions.

---

## 1) Google Search (SEO)

**What to post.** One clean, fast-loading page per tool, each targeting the plain-language job: "merge pdf," "split pdf," "pdf to jpg," "crop image," "qr code generator," "word counter," "signature maker," "extract pdf pages." Page = the tool working above the fold + a short "how it works" + a genuine FAQ (file privacy, size limits, no-signup). Cross-link the ecosystem: Signature Maker → /tools/edit-pdf, PDF to JPG → image-compressor, and so on. Structured data (already shipped) on every tool page.

**When to use it.** Always on. This is the compounding channel — the one that pays rent while we sleep. Every new Tool Factory tool ships with its SEO page day one.

**What not to do.** No keyword stuffing, no doorway pages, no "best free online PDF merger 2026" listicle spam, no thin duplicate pages that differ by one word. Don't claim "private" on a tool that uploads. Don't chase a keyword we haven't confirmed exists — search volume **needs research (Search Console)** before we build around it.

**Tracking method.** Search Console per page (impressions, position, CTR), first-party tool-usage events for landed traffic, AdSense RPM per page. Organic gets no UTMs (don't tag internal/organic links).

---

## 2) Google Search Console iteration

**What to post.** Nothing external — this is the optimization loop. Weekly: pull Queries and Pages, find (a) pages ranking positions 5–15 with real impressions (one content/title/internal-link pass can move these), (b) queries we're *shown* for but don't have a page for (potential next tool or FAQ), (c) high-impression/low-CTR pages (rewrite title + meta description).

**When to use it.** Weekly 30-minute review; deeper monthly. Before building any new SEO page, check here first for actual demand signal.

**What not to do.** Don't optimize for queries with no impressions. Don't rewrite a title that's already winning. Don't invent volume — the data in front of you is the data; if a query isn't there, it **needs research (Search Console)**, it doesn't get assumed.

**Tracking method.** Search Console is both the input and the scoreboard. Log each change with a date so we can attribute movement. Confirm downstream effect with first-party usage + AdSense.

---

## 3) NoteDrift lifecycle email (Resend)

**What to post.** Two lanes, kept strictly separate:
- **Transactional / lifecycle** (no marketing consent needed): account, billing receipts, Pro status, security. Genuinely useful, low volume.
- **Marketing** (opt-in only): product tips, new-tool announcements, "here's a workflow you might like." Only to people who explicitly opted in, with one-click unsubscribe honored immediately.

Voice: short, human, one idea per send, one clear link.

**When to use it.** Lifecycle fires on real events. Marketing sends are occasional and earn their place — a new tool worth knowing about, a real workflow tip. Cadence stays light; we'd rather under-send than train people to ignore us.

**What not to do.** **Never auto-opt-in.** Using a tool, creating an account, or upgrading does not add anyone to marketing. No re-subscribing someone who left. No fake "your file is waiting" urgency. No buried unsubscribe.

**Tracking method.** First-party opt-in/unsubscribe events, send/open/click from Resend, UTMs on every marketing link (`utm_source=newsletter`) so we see downstream tool/Pro behavior in first-party analytics, not just opens.

---

## 4) Product Hunt (major launches only)

**What to post.** A real launch: the editor, a Pro milestone, or a *bundle* moment like "8 free PDF & image tools, no signup." Tight tagline, a clean GIF/screens showing the tool actually working, a maker comment explaining the *why* (free, no-signup, private where true). Line up genuine users to show up — not vote-trading, just telling people who'd care that it's live.

**When to use it.** Rarely — only when there's something genuinely new and substantial. A single new tool is usually *not* a PH launch; the tool *suite* or the editor is. One good launch beats five forgettable ones.

**What not to do.** No vote rings, no incentivized upvotes, no launching a half-finished thing. Don't argue with critics in comments — answer, don't defend. Don't relaunch the same thing hoping for a better day.

**Tracking method.** UTMs (`utm_source=producthunt&utm_campaign=...`) on every link including the maker comment. First-party for signups/Pro on launch day and the 7-day tail. AdSense for the traffic-quality read.

---

## 5) Hacker News / Show HN (only when genuinely relevant)

**What to post.** A Show HN only when there's a technically interesting, honest story: "Show HN: In-browser PDF tools that never upload your file" — and it has to be *true* for the tool in question. Link straight to the working thing. First comment = the technical honest version (what runs client-side, what doesn't, what the limits are).

**When to use it.** Only when the client-side/privacy/architecture angle is real and the thing is polished. HN smells marketing instantly. If the honest pitch isn't interesting, don't post.

**What not to do.** No marketing-speak, no "revolutionary," no burying the caveat that some tools do touch the server. Don't ask for upvotes. Don't sockpuppet the thread. Don't get defensive — HN will stress-test the privacy claim, and if we overstated it we correct it publicly.

**Tracking method.** UTM `utm_source=hn` on the submitted link. First-party for what the spike did (usage, editor opens). Expect spiky, non-recurring traffic — judge it on quality, not just volume.

---

## 6) Reddit (value-first, never spam-blast)

**What to post.** Answers, not ads. Someone in r/pdf, r/productivity, r/students, r/freelance asks how to merge/split a PDF or make a transparent signature → give the actual steps, and *if* our tool is the cleanest path, mention it plainly ("there's a free no-signup one at… full disclosure I work on it"). Occasional standalone post only where self-promo is explicitly allowed, framed as "made this, it's free, no signup — feedback welcome."

**When to use it.** When there's a real thread we can genuinely help with, in subs where we're an actual participant. Build a little history in a sub before ever linking.

**What not to do.** No blast across 20 subs, no copy-paste comments, no dropping links where the rules forbid it, no undisclosed affiliation, no fake "I found this great tool" from a throwaway. One transparent, helpful presence beats ten deleted comments and a ban.

**Tracking method.** UTM `utm_source=reddit&utm_medium=comment|post`. First-party downstream. Track subreddit in `utm_content` so we learn which communities actually convert versus just click.

---

## 7) X / Threads

**What to post.** Short, useful, a little playful. Micro-demos (a 5-second GIF of Merge PDF reordering pages), one-line tool tips, "TIL you can crop to exact ratios in-browser, no upload." Occasional build-in-public notes. Reply usefully in relevant threads.

**When to use it.** Steady, low-effort cadence. Great for new-tool moments and short visual demos. Reply-in-threads works when we're genuinely adding to a conversation.

**What not to do.** No engagement-bait ("RT if…"), no reply-guy spam under big accounts, no thread-jacking, no buying followers, no fake-urgency drops. Playful ≠ gimmicky.

**Tracking method.** UTM `utm_source=x` / `utm_source=threads`, `utm_content` per post variant. First-party downstream. Native impressions are directional only — the real read is what the click did.

---

## 8) LinkedIn

**What to post.** The professional-workflow angle: "signature PNG → drop into edit-pdf to sign a contract in the browser," "merge these three reports before you send." Short build/lessons posts about shipping free tools. Speak to freelancers, ops, students, small teams.

**When to use it.** When the use case is genuinely work-flavored (contracts, reports, invoices, resumes). Lower frequency than X, higher polish.

**What not to do.** No corporate jargon, no "thrilled to announce," no engagement-pod trading, no motivational-fluff bait. Keep it human and specific — the thing we're allergic to on LinkedIn is exactly what NoteDrift's voice rejects.

**Tracking method.** UTM `utm_source=linkedin`. First-party downstream, watching for higher Pro intent (work users convert differently than casual). AdSense read on the traffic.

---

## 9) YouTube Shorts

**What to post.** 15–40s screen-capture how-tos, one tool per Short: "Merge 3 PDFs in 10 seconds, free, no signup." Show the real result on screen. Clear spoken/text hook in the first 2 seconds. Link the tool in the description.

**When to use it.** Evergreen how-to content that also feeds Google/YouTube search — a Short for "how to split a PDF" keeps working long after posting. Batch-produce alongside each tool's SEO page.

**What not to do.** No clickbait thumbnails that misrepresent, no fake "you won't believe," no reused footage that doesn't match the title, no overstating privacy for a server-side tool. Don't gate the payoff — show the tool actually doing the thing.

**Tracking method.** UTM `utm_source=youtube&utm_medium=video-desc` on description links. First-party downstream. YouTube's own retention/CTR analytics for creative iteration; conversions read first-party only.

---

## 10) TikTok / Reels

**What to post.** Fast, punchy, satisfying: the "oddly satisfying" reorder-and-merge, the signature draw-to-transparent-PNG reveal, "3 free browser tools that need zero signup." Trend-aware format, but the payoff is always a genuinely useful tool.

**When to use it.** For the tools with a visually satisfying moment (merge reorder, crop, signature, PDF→JPG). Higher-volume, lower-polish than YouTube; lean into personality and the slightly-playful voice.

**What not to do.** No fake-scarcity ("only free today"), no engagement-farm captions, no ripped audio/content we don't have rights to, no privacy overclaim for the hook. Don't force a trend that buries the tool.

**Tracking method.** UTM `utm_source=tiktok` / `utm_source=reels` on bio/link. Platform view/save metrics for creative signal only; conversions and tool usage read first-party. Watch save-rate — saves signal real intent to come back.

---

## 11) Software / tool directories

**What to post.** Accurate listings on legitimate free-tool and PDF/image-tool directories, AlternativeTo, relevant "awesome" lists, and no-signup-tool roundups. Consistent name, one-line description in our voice, honest feature/privacy claims, correct category, direct link to the tool page.

**When to use it.** Steady, ongoing — a batch pass per tool launch and a periodic sweep for new legitimate directories. This is durable referral + backlink value that supports SEO.

**What not to do.** No spammy link-farm directories, no paid "guaranteed #1 listing" schemes, no duplicate/misleading descriptions, no listing a tool in a category it doesn't fit. Skip any directory that looks like an SEO PBN — a bad backlink is worse than none.

**Tracking method.** UTM `utm_source={directory-name}&utm_campaign=tf1-directories` so each directory is separable. First-party downstream. Search Console to watch for the backlink's organic effect over time.

---

## 12) Legitimate digital PR / backlink outreach

**What to post.** Genuine outreach to writers/bloggers/newsletters who cover productivity, PDF/image workflows, students, or freelancing: a short, personal note offering a genuinely useful free tool for their "free tools" roundup or how-to. Optionally a small original angle (e.g., our stance on client-side privacy) if a journalist wants substance. Real relationships, real usefulness.

**When to use it.** Selectively, tied to a launch or a strong story. Quality over quantity — five well-fit, personalized pitches beat a hundred templated ones.

**What not to do.** No buying links, no PBNs, no link-exchange schemes, no mass-templated spray, no fake "as featured in." No paying for coverage dressed as editorial. If a link would violate Google's link-scheme guidelines, we don't want it.

**Tracking method.** UTM `utm_source={publication}&utm_medium=referral` where we can tag; Search Console to confirm the backlink is indexed and its organic effect; first-party for referral traffic quality. Maintain a simple owned outreach log (who, when, outcome) — first-party, nothing fabricated.

---

## Quick reference

| Channel | Cadence | Primary metric |
|---|---|---|
| SEO | Always-on | Search Console position/CTR, tool usage |
| Search Console loop | Weekly | Ranking movement, new query gaps |
| Lifecycle email | Event-driven + occasional (opt-in) | Opt-in rate, click→usage/Pro |
| Product Hunt | Major launches only | Launch-day signups/Pro (first-party) |
| HN / Show HN | Rare, when truly relevant | Traffic quality (first-party) |
| Reddit | When we can genuinely help | Comment/post → usage by subreddit |
| X / Threads | Steady, light | Click→usage (UTM + first-party) |
| LinkedIn | Occasional, work-angle | Click→Pro intent |
| YouTube Shorts | Evergreen, batched | Desc-link → usage, search pickup |
| TikTok / Reels | Higher volume | Save-rate, click→usage |
| Directories | Ongoing sweeps | Referral quality, backlink SEO effect |
| Digital PR | Selective, launch-tied | Indexed backlinks, referral quality |

**The one-line filter for any new tactic:** *Is it genuinely useful to the person on the other end, honest about what the tool does, and allowed where we're posting it?* If not, we don't ship it.
