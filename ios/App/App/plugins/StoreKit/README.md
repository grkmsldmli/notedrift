# NoteDrift StoreKit 2 plugin (native)

First-party Capacitor plugin exposing StoreKit 2 to the web layer. JS bridge:
`mobile/src/native/storekit.ts` (JS name `NoteDriftStoreKit`).

## Xcode integration (Mac, one-time)

These files are committed but not yet referenced by the Xcode target (Capacitor's
`.pbxproj` lists files explicitly). On a Mac:

1. Open `ios/App/App.xcworkspace` in Xcode.
2. Right-click the **App** group → **Add Files to "App"…** → select this
   `plugins/StoreKit` folder → ensure **Target: App** is checked → Add.
   (Adding the first `.m` prompts to create an Objective-C bridging header — allow
   it; the CAP_PLUGIN macro needs the Capacitor umbrella, already linked.)
3. Set the target's **iOS Deployment Target to 15.0** (StoreKit 2 requires iOS 15).
4. Add the **In-App Purchase** capability (Signing & Capabilities).
5. Add a **StoreKit Configuration file** for local testing, or configure the
   products in App Store Connect (see docs/ios/APP_STORE_CHECKLIST.md):
   - `com.notedrift.app.pro.monthly`, `com.notedrift.app.pro.yearly`
   - Subscription group: **NoteDrift Pro**.

## Methods

- `getProducts({ productIds })` → `{ products: [{ id, displayName, displayPrice }] }`
- `purchase({ productId, appAccountToken })` → `{ outcome, jwsTransaction?, jwsRenewalInfo?, message? }`
- `currentEntitlements()` → `{ transactions: [{ jwsTransaction, jwsRenewalInfo? }] }`
- `manageSubscriptions()` → opens Apple's manage-subscriptions sheet

`appAccountToken` is the signed-in Supabase user UUID; the server verifies the
signed transaction and checks that its `appAccountToken` equals the authenticated
user before granting Pro.
