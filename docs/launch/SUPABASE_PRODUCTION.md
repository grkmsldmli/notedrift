# Supabase Production Setup — NoteDrift

Manual Supabase Dashboard steps for the **production** project. **No secret
values here — only names and public settings.** Do these by hand.

> Only NoteDrift's own Supabase project. Never touch an unrelated project.

---

## 0. Which project is production?

Use a **dedicated production Supabase project** paired with **Stripe LIVE**, and
keep the existing/development project paired with **Stripe TEST**. This keeps each
database single-mode. See [`BILLING_STATE_AUDIT.md`](./BILLING_STATE_AUDIT.md) for
the full rationale and the billing-state audit. The `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in the Vercel
**Production** environment come from this production project.

## 1. Auth URL configuration (Authentication → URL Configuration)

- **Site URL**: `https://notedrift.com`
- **Redirect URLs** (allow-list) — add:
  - `https://notedrift.com/auth/callback`
  - `https://notedrift.com/**` (optional, covers `?next=` returns)
  - Local dev may keep `http://localhost:3000/auth/callback`.

The callback route (`src/app/auth/callback/route.ts`) only ever redirects back to
its own origin and to internal paths — no open redirect — so the allow-list is a
safety net, not something the app can be tricked past.

## 2. Magic-link email template (Authentication → Email Templates → Magic Link)

The callback supports the **stateless `token_hash` + `type` flow** (a magic link
works even if opened in a different browser/device from where it was requested),
with a PKCE `code` fallback. For the stateless flow, the Magic Link template's
link must include `token_hash` and `type`, e.g.:

```
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink
```

Keep the confirmation/other templates consistent if you use them. Do **not**
hard-code any of this in application code — it is dashboard configuration.

## 3. Google OAuth (optional — not required for launch)

Google sign-in is optional. If you want it: enable the Google provider
(Authentication → Providers → Google) with its client id/secret and add the
callback to Google's authorized redirect URIs. The app already handles the PKCE
`code` path. Launch does not depend on this.

## 4. Email delivery / SMTP

The app uses Supabase's built-in magic-link email; there is **no custom SMTP
configured in the repository**. Supabase's default email sender has low rate
limits intended for development. For production deliverability, configure a custom
SMTP provider (e.g., Resend, Postmark, SES) under Authentication → Email → SMTP
Settings. This is a dashboard/operational choice — no code change is needed.

## 5. Database migrations (apply to the production project)

Apply the SQL migrations in `supabase/migrations/` in filename order to the
production project (Supabase CLI `db push`, or paste each into the SQL Editor):

1. `20250904090000_cloud_canvas_sync.sql`
2. `20250904093000_cloud_grants.sql`
3. `20250904100000_billing_pro_entitlements.sql`
4. `20250905120000_billing_mode_guard.sql` ← **new this phase**

Then set the production database to **live** entitlement mode (one statement,
after reviewing [`BILLING_STATE_AUDIT.md`](./BILLING_STATE_AUDIT.md)):

```sql
update public.billing_config set expected_livemode = true;
```

On the **development/test** project, leave `expected_livemode = false` (the
default) so test billing keeps working.

## 6. Verify

- Sign in with a magic link on `https://notedrift.com` (and, to prove the
  stateless flow, open the link in a different browser).
- Save a canvas to the cloud; open it on another device.
- Confirm the Free 3-cloud cap and (after Stripe live Pro) unlimited cloud.
