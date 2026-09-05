# Stripe Production Cutover — NoteDrift

How to move NoteDrift billing from the TEST sandbox to LIVE. **This document
contains NO secret values — only variable names and the public product/price
shape.** Do the dashboard steps manually; they are intentionally NOT automated.

> Only the **NoteDrift** Stripe account/product. Never touch MinimumStress or any
> other Stripe account.

---

## 1. How the mode gate works (what the code enforces)

Billing mode is **explicit and fail-closed**, driven by the server-only env var
`STRIPE_BILLING_MODE` (`test` | `live`, default `test`):

- The Stripe key **must match** the mode: `test` ⇒ `sk_test_`/`rk_test_` only;
  `live` ⇒ `sk_live_`/`rk_live_` only. A mismatched key can't even construct the
  Stripe client. **A live key never *infers* live mode** — the mode is chosen
  explicitly.
- **LIVE additionally requires** `NODE_ENV=production` **and** a secure canonical
  origin (`NEXT_PUBLIC_SITE_URL` = an `https://` non-localhost URL). Otherwise
  billing returns unavailable (503) — it never silently falls back to test.
- Every trusted Stripe object/event must satisfy
  `object.livemode === (STRIPE_BILLING_MODE === "live")`:
  - **checkout** — creates sessions with the mode's key; redirects use the
    configured canonical origin in live (never a request Host).
  - **confirm-checkout** — the Checkout **session** *and* the **subscription**
    livemode must equal the expected mode, else rejected.
  - **webhook** — a wrong-mode event is acknowledged (200) but never written.
  - **price resolver** — the resolved Price must be active, recurring on the
    requested interval, and in the expected mode; otherwise refused (fail closed).
- The browser still sends only `{ interval }` (monthly/yearly). It can never
  choose mode, price, product, customer, user, or plan.

There is also a **database backstop** so a leftover TEST subscription can't grant
production Pro — see [`BILLING_STATE_AUDIT.md`](./BILLING_STATE_AUDIT.md).

## 2. Production environment variable NAMES

Set on Vercel (Production). Values come from Stripe LIVE / Supabase / literal —
never commit them.

| Name | Source | Notes |
|---|---|---|
| `STRIPE_BILLING_MODE` | literal `live` | selects live mode |
| `STRIPE_SECRET_KEY` | Stripe **LIVE** | `sk_live_…` (or a restricted `rk_live_…`) |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe LIVE | monthly Price id (or Product id) |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe LIVE | yearly Price id (or Product id) |
| `STRIPE_WEBHOOK_SECRET` | Stripe LIVE **Dashboard** webhook | `whsec_…` (different from any CLI secret) |
| `SUPABASE_SECRET_KEY` | Supabase prod | service-role/secret key (server only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase prod | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase prod | publishable (public) |
| `NEXT_PUBLIC_SITE_URL` | literal | `https://notedrift.com` |

Keep TEST credentials + `STRIPE_BILLING_MODE=test` on a **separate** Vercel
development/preview environment and the **test** Supabase project. Never mix.

## 3. Create the LIVE product and prices (Stripe Dashboard, LIVE mode)

1. Toggle the Dashboard to **live mode**.
2. Create product **NoteDrift Pro**.
3. Add two recurring prices, in **USD**:
   - **Monthly — $3.99 / month**
   - **Yearly — $29.99 / year**
4. Copy each Price id (`price_…`) into `STRIPE_PRICE_PRO_MONTHLY` /
   `STRIPE_PRICE_PRO_YEARLY`. (You may instead point these at the **Product** id
   `prod_…`; the resolver will pick that product's active recurring price for the
   interval, in the expected mode.)

The prices shown in the app come from the canonical `PRICING` constants in
`src/lib/plans.ts` ($3.99 / $29.99). Keep the Stripe live prices identical so the
displayed price matches what is charged.

## 4. Create the LIVE webhook (Stripe Dashboard, LIVE mode)

1. Developers → Webhooks → **Add endpoint** (in live mode).
2. Endpoint URL: `https://notedrift.com/api/stripe/webhook`.
3. Select exactly these events (derived from the implementation — do not add
   others):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET`.

**The Dashboard webhook signing secret is DIFFERENT from a local `stripe listen`
CLI secret.** Use the Dashboard secret in production.

Why these events: subscription lifecycle events are authoritative for
entitlement; `checkout.session.completed` triggers loading the real subscription
(checkout completion alone never grants Pro). Post-checkout `confirm-checkout`
reconciliation covers webhook delay, so a paid user isn't stuck on Free even if a
webhook is late.

## 5. Post-cutover verification

- Confirm `STRIPE_BILLING_MODE=live` + live key + `NODE_ENV=production` +
  `https://notedrift.com`: billing is available (not 503).
- Run the Stripe LIVE portion of [`SMOKE_TEST.md`](./SMOKE_TEST.md): a real
  monthly and yearly checkout, success reconciliation → account becomes Pro,
  Manage Billing portal, and cancel-at-period-end. Refund the live test charges
  from the Stripe Dashboard afterward.
- Confirm webhook deliveries succeed (200) in the Stripe Dashboard.

## Do NOT (until you are ready to go live)

- Do not put live keys in the local `.env.local` or the dev/preview environment.
- Do not create real charges during development.
- Do not point a **test** webhook at production or vice versa.
