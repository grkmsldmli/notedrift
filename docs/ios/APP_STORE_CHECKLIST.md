# NoteDrift iOS — App Store Review Checklist

Do **not** submit for review until the blocking items below are done. This phase
delivers the architecture and a buildable shell only.

## Blocking before submission

### 1. In-app purchases — StoreKit (Guideline 3.1.1)
- [ ] Implement Apple IAP (StoreKit 2) for NoteDrift Pro (monthly + yearly auto-
      renewable subscriptions).
- [ ] Replace the placeholder in `UpgradeDialog` (native branch) with a real
      StoreKit purchase + restore flow, gated by `billingPlatform() === "apple"`.
- [ ] After a successful Apple purchase, reconcile entitlement server-side so the
      existing server-authoritative `get_billing_status()` reflects Pro (a new
      `/api/billing/apple/verify`-style receipt endpoint that accepts an
      `Authorization: Bearer <supabase access token>` — the native session is not a
      notedrift.com cookie, so cookie-authed routes won't work; see §4).
- [ ] Provide "Restore Purchases".
- [ ] **No** external purchase links or "buy on the web" messaging in the app
      (already: Stripe checkout/portal are unreachable on native).

### 2. Account & auth (Guideline 4.8 / 5.1.1)
- [ ] Google is hidden on native; **Email OTP** is the login. Verify it end-to-end.
- [ ] **Sign in with Apple**: required by 4.8 if you offer any third-party login in
      the app. Since only Email OTP (first-party) is exposed on iOS, Sign in with
      Apple is **not strictly required** for this configuration — but recommended.
      - Next step to add it: use `ASAuthorizationController` (or a Capacitor Apple
        sign-in plugin) to get an Apple **ID token + nonce**, then feed it into the
        existing `signInWithIdToken({ provider: "apple", token, nonce })` path in
        `src/lib/auth/client.ts` (the Google exchange already proves this works
        cross-origin). Configure Apple as a provider in Supabase Auth.
- [ ] Offer **account deletion** from within the app if accounts are supported
      (Guideline 5.1.1(v)) — link/flow to delete the NoteDrift account.

### 3. Privacy
- [ ] Add `ios/App/App/PrivacyInfo.xcprivacy` with required-reason API declarations:
      - `NSPrivacyAccessedAPICategoryUserDefaults` → reason `CA92.1`
      - `NSPrivacyAccessedAPICategoryFileTimestamp` → reason `C617.1` (Filesystem)
      - `NSPrivacyTracking = false`; `NSPrivacyCollectedDataTypes` = none unless the
        backend collects PII (declare email if used for accounts).
- [ ] App Privacy questionnaire in App Store Connect: declare what Supabase stores
      (email for accounts, canvas data for Pro cloud). No tracking, no ads SDK on iOS.
- [ ] `NSPhotoLibraryUsageDescription` present and truthful (image import) — done.
- [ ] Confirm **no** camera/microphone/location/contacts usage strings (none added).

### 4. Backend for native
- [ ] `/api/*` routes authenticate via a `notedrift.com` **cookie**; the native app's
      session lives on the local origin. For any server route the app must call
      (IAP receipt verify, email), add **bearer-token** auth (accept
      `Authorization: Bearer <supabase access token>`), or keep those flows web-only.
- [ ] Verify CORS on notedrift.com allows the native origin for any such route.

### 5. Content & metadata
- [ ] App Store screenshots (iPhone 6.7"/6.5" + iPad 12.9"), description, keywords.
- [ ] Support URL + marketing URL (notedrift.com), privacy policy URL
      (`/privacy`), terms (`/terms`).
- [ ] Age rating questionnaire.
- [ ] App icon: 1024×1024 generated from the NoteDrift brand (done, in Assets.xcassets).

## Already satisfied by this phase
- Local bundle, no remote `server.url`, no cleartext, no broad `allowNavigation`.
- No AdSense on iOS (seam + shim); no third-party ad SDK.
- No Stripe checkout/portal reachable from the iOS UI.
- Existing Pro entitlement honored (server-authoritative, read-only on native).
- App boots offline to the editor; portrait+landscape; iPhone + iPad; safe areas.
- Truthful, minimal permissions; export-compliance flag set.

## Order of work for the next phase
1. Bearer-token auth on the backend routes the app needs (§4).
2. StoreKit IAP + server receipt reconciliation (§1).
3. `PrivacyInfo.xcprivacy` + App Privacy answers (§3).
4. (Recommended) Sign in with Apple via `signInWithIdToken` (§2).
5. Account deletion flow (§2).
6. Session persistence adapter (Capacitor Preferences) if device testing shows
   cold-start sign-outs (IOS_ARCHITECTURE §7).
