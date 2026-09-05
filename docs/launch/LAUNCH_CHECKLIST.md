# NoteDrift — Production Launch Checklist

The master, ordered runbook for taking NoteDrift live at
**https://notedrift.com**. Work top to bottom. Each stage links to a detailed
companion doc where relevant. **No secret values appear in these docs — only
variable NAMES.**

> Safety: this checklist configures the **NoteDrift** product only
> (`grkmsldmli/notedrift`). Never touch MinimumStress or any unrelated Stripe /
> Supabase / domain account.

> **Production Supabase decision (2026-09-05): reuse the existing project
> `kmgcmoaveppzhjezyqax`.** The DB cutover (mode-guard migration + TEST-billing
> cleanup + `expected_livemode=true`) runs in the Supabase SQL Editor per
> [`EXISTING_PROJECT_CUTOVER.md`](./EXISTING_PROJECT_CUTOVER.md).

Companion docs:

- [`EXISTING_PROJECT_CUTOVER.md`](./EXISTING_PROJECT_CUTOVER.md) — **the chosen** DB cutover runbook (SQL Editor, transactional).
- [`STRIPE_PRODUCTION_CUTOVER.md`](./STRIPE_PRODUCTION_CUTOVER.md) — Stripe LIVE product, prices, webhook, env names.
- [`SUPABASE_PRODUCTION.md`](./SUPABASE_PRODUCTION.md) — Supabase production auth + dashboard steps.
- [`BILLING_STATE_AUDIT.md`](./BILLING_STATE_AUDIT.md) — test/live DB strategy + rationale (fresh-project option kept for reference).
- [`SMOKE_TEST.md`](./SMOKE_TEST.md) — post-deploy manual real-device test checklist.

---

## A. Code ready ✅ (this phase)

- [x] Explicit fail-closed Stripe **test/live mode** (`STRIPE_BILLING_MODE`).
- [x] Key/mode/origin validation; live requires production + secure https origin.
- [x] `livemode` verified on every trusted Stripe flow (checkout, confirm,
      webhook, price resolver).
- [x] Mode-aware DB backstop migration
      (`supabase/migrations/20250905120000_billing_mode_guard.sql`).
- [x] `/privacy`, `/terms`, `robots.ts`, `sitemap.ts`, root metadata, security headers.
- [x] `.env.example`, README, and these launch docs.
- [x] Quality gate green: `npm test`, `npx tsc --noEmit`, `npm run lint`,
      `npm run build`.

## B. Vercel project

1. Create/confirm the Vercel project connected to `grkmsldmli/notedrift`, main branch.
2. Framework preset: Next.js. Build command `next build` (default); install runs
   the `postinstall` pdf.js asset copy automatically.
3. Do **not** enable the Production environment until env vars (C) are set.

## C. Production environment variables (Vercel → Project → Settings → Environment Variables)

Set these **NAMES** for the **Production** environment (values from the services
below; never commit them):

| Name | Where the value comes from |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://notedrift.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase production project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase production project (publishable key) |
| `SUPABASE_SECRET_KEY` | Supabase production project (service-role/secret key) |
| `STRIPE_BILLING_MODE` | literal `live` |
| `STRIPE_SECRET_KEY` | Stripe **LIVE** secret key (`sk_live_…`) |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe LIVE monthly Price (or Product) id |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe LIVE yearly Price (or Product) id |
| `STRIPE_WEBHOOK_SECRET` | Stripe LIVE **Dashboard** webhook signing secret |

`NODE_ENV=production` is set by Vercel automatically for Production builds — do
not set it yourself. Keep a separate **development/preview** environment on
`STRIPE_BILLING_MODE=test` with TEST credentials and the test Supabase project.

## D. notedrift.com domain

1. Add `notedrift.com` (and `www.notedrift.com`) as a domain in the Vercel project.
2. Update GoDaddy DNS per Vercel's instructions (A/ALIAS + CNAME). **Manual.**
3. Confirm HTTPS is issued and `https://notedrift.com` serves the app. HTTPS is
   mandatory (the Sound Meter microphone requires a secure context).

## E. Supabase production (reuse existing project `kmgcmoaveppzhjezyqax`)

Auth config → see [`SUPABASE_PRODUCTION.md`](./SUPABASE_PRODUCTION.md):
1. Site URL = `https://notedrift.com`.
2. Redirect allow-list includes `https://notedrift.com/auth/callback`.
3. Magic-link email template emits `token_hash` + `type` (stateless links).

DB cutover → run [`EXISTING_PROJECT_CUTOVER.md`](./EXISTING_PROJECT_CUTOVER.md) in
the SQL Editor: apply the mode-guard migration, transactionally remove TEST
billing state, then `update billing_config set expected_livemode = true`. A
read-only audit + a local billing backup were captured on 2026-09-05.

## F. Stripe LIVE product / prices → see [`STRIPE_PRODUCTION_CUTOVER.md`](./STRIPE_PRODUCTION_CUTOVER.md)

1. In **live mode**, create product **NoteDrift Pro**.
2. Monthly price **$3.99 USD / month** and yearly price **$29.99 USD / year**.
3. Copy the two Price ids into `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` (C).

## G. Stripe LIVE webhook → see [`STRIPE_PRODUCTION_CUTOVER.md`](./STRIPE_PRODUCTION_CUTOVER.md)

1. Create a **live** webhook endpoint at `https://notedrift.com/api/stripe/webhook`.
2. Subscribe to: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
3. Copy the endpoint's **signing secret** into `STRIPE_WEBHOOK_SECRET` (C). It is
   different from any local `stripe listen` secret.

## H. Production deployment

1. With C–G done, enable/deploy the Production environment on Vercel.
2. Confirm the build passes and the site loads at `https://notedrift.com`.

## I. Live smoke test → run [`SMOKE_TEST.md`](./SMOKE_TEST.md)

Editor, auth, cloud, **Stripe LIVE** checkout/portal (a real card — you can
refund it in the Stripe Dashboard), audio, PDF, and mobile Safari. Do not
consider launch done until this passes.

## J. Search Console + sitemap

1. Verify `https://notedrift.com` in Google Search Console.
2. Submit `https://notedrift.com/sitemap.xml`.
3. Confirm `https://notedrift.com/robots.txt` is served and correct.

## K. Launch

Announce. Monitor Stripe (webhook deliveries, first live subscription) and
Supabase logs for the first live cohort.

---

## Known public URLs

| URL | Purpose |
|---|---|
| https://notedrift.com | Editor (homepage / canvas) |
| https://notedrift.com/auth/callback | Auth (magic link / OAuth) callback |
| https://notedrift.com/api/stripe/webhook | Stripe webhook receiver |
| https://notedrift.com/sitemap.xml | Sitemap |
| https://notedrift.com/robots.txt | Robots |
| https://notedrift.com/privacy | Privacy Policy |
| https://notedrift.com/terms | Terms of Service |

## USER ACTION REQUIRED before launch (owner decisions)

- **Operator legal name** — the legal entity/person operating NoteDrift, for the
  legal pages (currently they truthfully refer to "NoteDrift"/"the NoteDrift
  service"). Provide it if a named operator is required in your jurisdiction.
- **Contact mailbox** — confirm `support@notedrift.com` is live (or substitute
  your preferred address; it is defined once in `src/components/legal/LegalPage.tsx`).
- **Governing law / jurisdiction** — add if you want it stated in the Terms.
- These docs are launch runbooks, not legal advice; have the Privacy/Terms
  reviewed by a professional if your context requires it.
