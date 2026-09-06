# NoteDrift UTM Tagging Standard

*Owner: Growth. Source of truth for every link we place ourselves. If a rule here blocks you, change the rule in a PR — don't improvise in the wild.*

Every inbound link **we control** gets tagged so we can see which tool, which channel, and which post actually moved someone to NoteDrift — and, where the value survives the funnel, to Pro. Untagged owned links are lost data. This doc makes tagging mechanical.

---

## The one rule

**Tag links we place. Never tag links other people click to reach us.**

Add UTMs to links we own and publish: our emails, our own social posts, our directory/listing entries, our paid ads. Do **not** append UTMs to organic search results, other people's shares, or anything we don't control — analytics already attributes those via the referrer, and fake UTMs there corrupt the real numbers.

We don't tag Google organic results (we don't own those links). Organic-search performance and keyword volume come from Search Console — for any specific keyword number, write **needs research (Search Console)**. Never estimate a search volume.

---

## The five parameters

| Parameter | Required | What it answers | Example |
|---|---|---|---|
| `utm_source` | **Yes** | Which specific property sent them | `newsletter` |
| `utm_medium` | **Yes** | The channel *type* | `email` |
| `utm_campaign` | **Yes** | Which launch/push it belongs to | `tof1-merge-pdf-202609` |
| `utm_content` | Recommended | Which link/slot/variant inside the campaign | `hero-cta` |
| `utm_term` | Optional | Paid keyword or A/B term (paid only) | `pdf-merger` |

A link with source + medium + campaign is valid. Add `utm_content` whenever the same campaign has more than one link (it almost always does). `utm_term` is for `cpc` keywords or explicit A/B tests — leave it off organic links.

---

## Allowed values — `utm_source`

Closed list. If your source isn't here, add it here first (PR), then use it.

| Value | Use for |
|---|---|
| `google` | Google Ads |
| `newsletter` | Our email sends (lifecycle + broadcast) |
| `x` | Our X account posts |
| `threads` | Our Threads posts |
| `linkedin` | Our LinkedIn posts / page |
| `youtube` | Our video descriptions, cards, pinned comments |
| `reddit` | Our Reddit posts/comments |
| `producthunt` | Product Hunt launch + listing |
| `directory` | Tool directories & listing sites (AlternativeTo, etc.) |

## Allowed values — `utm_medium`

| Value | Meaning |
|---|---|
| `organic` | Unpaid placement we control that isn't email or social (e.g. an editorial mention we arranged) — rare |
| `email` | Newsletter / lifecycle / broadcast sends |
| `social` | Organic posts from our own social accounts |
| `referral` | Links from other sites & listings (directories, Product Hunt, partner posts) |
| `cpc` | Paid clicks (Google Ads, boosted/promoted social) |

### Valid source × medium pairings

| Source | Medium |
|---|---|
| `google` | `cpc` |
| `newsletter` | `email` |
| `x`, `threads`, `linkedin`, `reddit` | `social` (or `cpc` when the post is paid/boosted) |
| `youtube` | `social` |
| `producthunt`, `directory` | `referral` |

One source and one medium per link. If a pairing you need isn't listed, it probably means you're mislabeling the channel — check before inventing a combo.

---

## Campaign naming — `utm_campaign`

**Tool launches:** `tof1-<tool>-<yyyymm>`

- `tof1` — the initiative (Tool Factory 1). Groups all 8 tool launches together.
- `<tool>` — the exact route slug (see table).
- `<yyyymm>` — the launch month, e.g. `202609`.

Example: `tof1-qr-code-generator-202609`

**Tool slugs (use these verbatim):**

| Tool | Slug |
|---|---|
| Merge PDF | `merge-pdf` |
| Split PDF | `split-pdf` |
| Extract PDF Pages | `extract-pdf-pages` |
| PDF to JPG | `pdf-to-jpg` |
| Crop Image | `crop-image` |
| QR Code Generator | `qr-code-generator` |
| Word Counter | `word-counter` |
| Signature Maker | `signature-maker` |

**Non-tool campaigns:** `<initiative>-<yyyymm>` — e.g. `pro-nudge-202609`, `brand-202609`, `welcome-202609`.

Campaign values are permanent once live. Renaming mid-flight splits one campaign into two in reporting. Pick it once, spell it right.

---

## Content slots — `utm_content`

`utm_content` labels **where the link sits**, never who clicked it. Lowercase, kebab-case, describes the placement or variant:

| Slot | Meaning |
|---|---|
| `hero-cta` | Primary button/link at the top |
| `footer` | Footer link |
| `body-link` | Inline link in the body |
| `post-1`, `thread-2` | Which post / which item in a thread |
| `pinned`, `bio-link` | Pinned post, profile/bio link |
| `listing` | The main listing entry (PH, directory) |
| `day3-upgrade` | Which lifecycle email + its CTA |
| `cross-sell` | Cross-promo from another tool/page |

Two links to the same URL in the same campaign **must** differ by `utm_content`, or you can't tell them apart.

---

## Formatting rules

- **Lowercase everything.** `Newsletter` and `newsletter` become two rows.
- **Kebab-case, no spaces.** Hyphens between words; ASCII only.
- **No PII, ever.** No emails, names, user IDs, or session tokens in any parameter or in the path. `utm_content` is a slot label, not a person. This is a privacy line, not a style preference — it also keeps us clear of leaking identifiers into third-party analytics.
- **Keep functional params first, UTMs after.** e.g. `/?upgrade=1&utm_source=...`.
- **Stable values.** Don't rename a live source/campaign/content value.
- **Build, don't hand-type.** Use a saved link-builder sheet or snippet; typos silently fork your data.

---

## Lifecycle & marketing email

Our lifecycle emails already deep-link to **`/?upgrade=1`** (opens the upgrade path). Keep that param and append UTMs after it. Every email link carries:

```
utm_source=newsletter&utm_medium=email
```

- **Campaign** = the trigger/send, e.g. `pro-nudge-202609`, `welcome-202609`.
- **Content** = which email in the sequence + which CTA, e.g. `day3-upgrade`, `footer`.

**Opt-in is mandatory.** Marketing/lifecycle email goes only to users who explicitly opted in. We never auto-opt-in and never infer consent. Transactional mail (receipts, security) is a separate stream and is not tagged as a marketing campaign.

---

## Ready-to-use tagged URLs

Examples use the production domain — swap in the live host if it differs. Copy, adjust the month, ship.

**1 — Newsletter → Merge PDF launch**
```
https://notedrift.com/tools/merge-pdf?utm_source=newsletter&utm_medium=email&utm_campaign=tof1-merge-pdf-202609&utm_content=hero-cta
```

**2 — X post → QR Code Generator**
```
https://notedrift.com/tools/qr-code-generator?utm_source=x&utm_medium=social&utm_campaign=tof1-qr-code-generator-202609&utm_content=post-1
```

**3 — Product Hunt listing → Split PDF**
```
https://notedrift.com/tools/split-pdf?utm_source=producthunt&utm_medium=referral&utm_campaign=tof1-split-pdf-202609&utm_content=listing
```

**4 — Reddit post → Word Counter**
```
https://notedrift.com/tools/word-counter?utm_source=reddit&utm_medium=social&utm_campaign=tof1-word-counter-202609&utm_content=post-1
```

**5 — Directory listing → Crop Image**
```
https://notedrift.com/tools/crop-image?utm_source=directory&utm_medium=referral&utm_campaign=tof1-crop-image-202609&utm_content=alternativeto
```

**6 — Lifecycle email upgrade nudge → `/?upgrade=1`**
```
https://notedrift.com/?upgrade=1&utm_source=newsletter&utm_medium=email&utm_campaign=pro-nudge-202609&utm_content=day3-upgrade
```

---

## What this does and doesn't tell us

- **We can attribute:** landings by source / medium / campaign / content, and — where the UTM context persists through the funnel — the Pro upgrades that followed. That's the point: connect a specific post or send to real signups, not vanity clicks.
- **We can't invent:** keyword search volume (**needs research (Search Console)**), or any metric we don't actually collect. If a number isn't in Search Console, GA, or Stripe, we don't cite it.
- **No dark patterns.** UTMs identify *placements*, never individuals. If a tag would only make sense as a way to single out a person, it doesn't belong in the URL.

---

## Governance

1. **This file is the source of truth.** New source, medium, or campaign pattern → PR here first, then use it.
2. **QA every link:** click it, confirm it lands on the right page and the params survive any redirect.
3. **Review quarterly:** prune dead sources, confirm the funnel still carries UTM context to checkout.
