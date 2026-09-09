# NoteDrift iOS — App Store Review Checklist

Do **not** submit for review until the blocking items below are done. This phase
delivers the architecture and a buildable shell only.

## App Store Connect — exact setup values

- **Bundle ID:** `com.notedrift.app`
- **Subscription group:** `NoteDrift Pro`
- **Auto-renewable subscription products:**
  - `com.notedrift.app.pro.monthly`
  - `com.notedrift.app.pro.yearly`
- **App Store Server Notifications V2 URL** (Production + Sandbox):
  `https://notedrift.com/api/apple/notifications`
- **App Store Server API key** (Keys → In-App Purchase): create a key; note the
  Issuer ID, Key ID, and download the `.p8` (only needed if you later call Apple's
  server API — signature verification itself needs only the root certs below).
- **Backend env:** `APPLE_IAP_ROOT_CAS_BASE64` (comma-separated base64 DER of
  Apple's PKI root certs), `APPLE_IAP_APP_APPLE_ID` (App Information → Apple ID),
  optional `APPLE_IAP_ONLINE_CHECKS=false` to disable OCSP checks.

## Blocking before submission

### 1. In-app purchases — StoreKit (Guideline 3.1.1)
- [x] StoreKit 2 purchase/restore implemented (`AppleUpgradePanel`, the Swift
      plugin, `/api/billing/apple/verify`). Server-authoritative Pro; no Stripe on
      native; no external purchase CTA. **Requires on-device sandbox verification.**
- [ ] Create the two products + subscription group in App Store Connect (above).
- [ ] Add `ios/App/App/plugins/StoreKit/*` to the Xcode target, set iOS Deployment
      Target 15.0, add the **In-App Purchase** capability (plugin README).
- [ ] Set the backend env (above) so the verify/notifications routes are live.
- [ ] Sandbox-test: purchase, restore, renew, refund/revoke → entitlement updates.

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
- [x] **Account deletion** in-app (Guideline 5.1.1(v)) — Account menu → Delete
      account (type-DELETE confirm) → `DELETE /api/account` removes storage objects
      + cascades all user data + deletes the auth user. It truthfully states it does
      NOT cancel an active App Store subscription. **Verify on device.**

### 3. Privacy
- [ ] Add `ios/App/App/PrivacyInfo.xcprivacy` — do NOT copy guessed reason codes.
      Generate the truthful set on a Mac: Xcode → Product → Archive →
      **Generate Privacy Report**, and address any required-reason API build
      warnings. Capacitor plugins ship their own manifests; the app manifest only
      needs what the app binary itself uses. Set `NSPrivacyTracking = false` (no
      tracking, no ad SDK on iOS). Declare in `NSPrivacyCollectedDataTypes` only
      what the backend actually collects (email for accounts; user content /
      canvases for Pro cloud) — mirror the App Store Connect App Privacy answers.
- [ ] App Privacy questionnaire in App Store Connect: declare what Supabase stores
      (email for accounts, canvas data for Pro cloud). No tracking, no ads SDK on iOS.
- [ ] `NSPhotoLibraryUsageDescription` present and truthful (image import) — done.
- [ ] Confirm usage strings: `NSPhotoLibraryUsageDescription` + `NSCameraUsageDescription`
      (image import + Take Photo). **No** microphone/location/contacts strings.

### 4. Backend for native
- [x] Bearer-token auth (`requireAuthenticatedUser`) on the native routes
      (`/api/billing/apple/verify`, `/api/account`); cookie auth still works on web.
- [x] Narrow CORS on exactly those native endpoints (`src/lib/http/cors.ts`) — a
      fixed Capacitor-origin allowlist, never global/permissive.
- [ ] Deploy the migration `20260907120000_apple_iap_entitlements.sql` and set the
      Apple env vars so the routes leave "unconfigured".

### 5. Content & metadata
- [ ] App Store screenshots (iPhone 6.7"/6.5" + iPad 12.9"), description, keywords.
- [ ] Support URL + marketing URL (notedrift.com), privacy policy URL
      (`/privacy`), terms (`/terms`).
- [ ] Age rating questionnaire.
- [ ] App icon: 1024×1024 generated from the NoteDrift brand (done, in Assets.xcassets).

## Already satisfied (code complete; needs Mac/device verification)
- Local bundle, no remote `server.url`, no cleartext, no broad `allowNavigation`.
- No AdSense on iOS; no third-party ad SDK.
- No Stripe checkout/portal reachable from the iOS UI; StoreKit 2 purchase/restore.
- Unified entitlement: `is_pro()` = Stripe OR verified Apple (mode-aware).
- Existing web Pro honored on iOS; no repurchase/downgrade.
- Bearer auth + narrow CORS on native endpoints; account deletion in-app.
- Native session persistence via localStorage seam (CONDITIONAL — device verify).
- App boots offline to the editor; portrait+landscape; iPhone + iPad; safe areas.
- Truthful, minimal permissions; export-compliance flag set.

## Remaining before submission
1. Deploy migration + set Apple env; create products/group + notification URL (§1).
2. Xcode: add the StoreKit plugin files to the target, iOS 15 target, IAP capability.
3. On-device sandbox: purchase / restore / renew / refund / revoke; account deletion.
4. `PrivacyInfo.xcprivacy` from the Xcode privacy report + App Privacy answers (§3).
5. Confirm session persists across a cold app restart (IOS_ARCHITECTURE §19).
6. Screenshots + metadata (§5).
   (Sign in with Apple is NOT required while iOS exposes only Email OTP — §2.)
