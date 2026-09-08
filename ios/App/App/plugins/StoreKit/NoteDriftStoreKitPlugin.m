#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the Swift StoreKit 2 plugin with Capacitor's bridge under the JS name
// "NoteDriftStoreKit" (see mobile/src/native/storekit.ts). The CAP_PLUGIN macro
// looks the Swift class up by its @objc name at load time, so no Swift bridging
// header is required.
CAP_PLUGIN(NoteDriftStoreKitPlugin, "NoteDriftStoreKit",
  CAP_PLUGIN_METHOD(getProducts, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(currentEntitlements, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(sync, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(manageSubscriptions, CAPPluginReturnPromise);
)
