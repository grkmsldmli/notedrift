# NoteDrift iOS — TestFlight Checklist

Everything here after "Prerequisites" requires **macOS + Xcode**. The web/bundle
steps run on any OS.

## Prerequisites (once)
- [ ] A Mac with Xcode (latest stable) + Command Line Tools.
- [ ] CocoaPods installed (`sudo gem install cocoapods` or `brew install cocoapods`).
- [ ] Apple Developer Program membership (paid) for the team `com.notedrift.app`.
- [ ] Node 20+ and `npm install` run in the repo.

## 1. Build the local web bundle (any OS)
- [ ] `npm run mobile:build` — produces `mobile/dist/index.html` (+ assets, fonts, pdf.js).
- [ ] Confirm real public env is set for a store build (Vite bakes them):
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), `NEXT_PUBLIC_SITE_URL`.
      Without them the app still boots offline, but sign-in/cloud are disabled.
- [ ] `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is irrelevant on iOS (Google is hidden).

## 2. Sync the native project (Mac)
- [ ] `npm run ios:sync` (runs `mobile:build` then `npx cap sync ios`).
- [ ] `cd ios/App && pod install` if pods didn't install during sync.
- [ ] `npm run ios:open` → opens `ios/App/App.xcworkspace` (the **workspace**, not the project).

## 3. Configure signing & identity in Xcode
- [ ] Target **App** → Signing & Capabilities → select the NoteDrift team; enable
      "Automatically manage signing".
- [ ] Bundle Identifier = `com.notedrift.app`.
- [ ] Set **Display Name** = NoteDrift (already in Info.plist).
- [ ] Set **Version** (`CFBundleShortVersionString`, e.g. 1.0.0) and **Build**
      (`CFBundleVersion`, e.g. 1) — increment Build for every TestFlight upload.
- [ ] Deployment target: iOS 14+ (Capacitor 7 default; confirm).

## 4. Sanity-run on device / simulator
- [ ] Run on an iPhone simulator and a physical iPad.
- [ ] Editor opens offline (airplane mode): canvas draws, tools work, autosave persists.
- [ ] Email OTP sign-in succeeds (needs network + Supabase env baked in).
      - Confirm the Supabase Auth email template sends the **6-digit code**
        (`{{ .Token }}`), not only a magic link — the app uses OTP, not a callback.
- [ ] A web-purchased Pro account shows Pro (ad-free, pro exports) after sign-in.
- [ ] Export a PNG/PDF → the **native Share sheet** appears (Save to Files works).
- [ ] Import an image via the toolbar → the photo picker appears.
- [ ] No AdSense loads; the "Upgrade" sheet shows StoreKit prices (no Stripe).
- [ ] Safe areas, portrait+landscape, keyboard behavior look correct (device check).

## 4a. StoreKit IAP (sandbox) — Mac + device
- [ ] Add `ios/App/App/plugins/StoreKit/*` to the Xcode App target; set iOS
      Deployment Target 15.0; add the **In-App Purchase** capability.
- [ ] Create the products + `NoteDrift Pro` group in App Store Connect, or add a
      local **StoreKit Configuration** file for simulator testing.
- [ ] Set backend env (`APPLE_IAP_ROOT_CAS_BASE64`, `APPLE_IAP_APP_APPLE_ID`) and
      deploy the migration so `/api/billing/apple/verify` isn't "unconfigured".
- [ ] Sign in, buy Monthly and Yearly with a Sandbox Apple ID → Pro unlocks.
- [ ] Restore Purchases on a fresh install → Pro returns.
- [ ] Set the App Store Server Notifications V2 URL to
      `https://notedrift.com/api/apple/notifications`; force renew/expire/refund and
      confirm entitlement updates.
- [ ] Manage subscription opens Apple's sheet (not Stripe).
- [ ] Delete account (Account menu) removes data; confirm it does NOT cancel the
      subscription (message shown).

## 5. Privacy manifest & export compliance (Mac)
- [ ] Add `ios/App/App/PrivacyInfo.xcprivacy` declaring required-reason APIs used by
      Capacitor/plugins (UserDefaults `CA92.1`, file-timestamp `C617.1` for
      Filesystem). See APP_STORE_CHECKLIST.
- [ ] `ITSAppUsesNonExemptEncryption = false` is already in Info.plist (no prompt).

## 6. Archive & upload
- [ ] Xcode → any iOS device target → Product → **Archive**.
- [ ] Organizer → Distribute App → **App Store Connect** → Upload.
- [ ] In App Store Connect, create the app record (`com.notedrift.app`) if missing.
- [ ] Wait for processing, then add the build to a TestFlight group.
- [ ] Provide test notes; invite internal/external testers.

## 7. Known limitations to note for testers (this phase)
- Google sign-in is intentionally hidden on iOS; use Email OTP.
- Session persistence uses a localStorage seam (IOS_ARCHITECTURE §19). If a
  signed-in session is lost after a full app restart, that seam needs adjustment —
  verify explicitly on device before wider testing (status: CONDITIONAL).
- StoreKit purchases require the Xcode/App Store Connect setup in §4a; until the
  backend Apple env is set, the verify route reports "unconfigured".
