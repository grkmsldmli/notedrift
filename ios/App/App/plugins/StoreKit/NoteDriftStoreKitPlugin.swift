import Foundation
import Capacitor
import StoreKit

// First-party StoreKit 2 Capacitor plugin for NoteDrift Pro subscriptions.
// Exposes: getProducts, purchase, currentEntitlements, manageSubscriptions.
//
// Verification model: the plugin returns Apple's SIGNED JWS representations
// (VerificationResult.jwsRepresentation) to JavaScript, which forwards them to the
// server for cryptographic verification with @apple/app-store-server-library. No
// receipt parsing happens in JS; the server is the entitlement authority. The
// appAccountToken is set to the signed-in Supabase user's UUID so the server can
// bind the Apple transaction to the account.
//
// Requires iOS 15+ (StoreKit 2). Set the target's iOS Deployment Target to 15.0.
@available(iOS 15.0, *)
@objc(NoteDriftStoreKitPlugin)
public class NoteDriftStoreKitPlugin: CAPPlugin {

    // MARK: getProducts

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds is required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: ids)
                let payload: [[String: Any]] = products.map { product in
                    [
                        "id": product.id,
                        "displayName": product.displayName,
                        "displayPrice": product.displayPrice,
                    ]
                }
                call.resolve(["products": payload])
            } catch {
                call.reject("getProducts failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: purchase

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        // A NoteDrift Pro purchase MUST be bound to the signed-in Supabase user.
        // Reject BEFORE Product.purchase() if appAccountToken is missing or not a
        // valid UUID — never start a purchase without it (defense in depth; the JS
        // path already passes the signed-in user's UUID).
        guard let tokenString = call.getString("appAccountToken"),
              let accountToken = UUID(uuidString: tokenString) else {
            call.resolve([
                "outcome": "failed",
                "message": "appAccountToken (a valid UUID) is required",
            ])
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.resolve(["outcome": "failed", "message": "product not found"])
                    return
                }

                // Always bind the App Store transaction to the Supabase user.
                let options: Set<Product.PurchaseOption> = [.appAccountToken(accountToken)]

                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        let jws = verification.jwsRepresentation
                        let renewalJws = await self.renewalJws(for: product)
                        await transaction.finish()
                        call.resolve([
                            "outcome": "success",
                            "jwsTransaction": jws,
                            "jwsRenewalInfo": renewalJws as Any,
                        ])
                    case .unverified:
                        call.resolve(["outcome": "failed", "message": "unverified transaction"])
                    }
                case .userCancelled:
                    call.resolve(["outcome": "cancelled"])
                case .pending:
                    call.resolve(["outcome": "pending"])
                @unknown default:
                    call.resolve(["outcome": "failed"])
                }
            } catch {
                call.resolve(["outcome": "failed", "message": error.localizedDescription])
            }
        }
    }

    // MARK: currentEntitlements (Restore)

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            var transactions: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                guard case .verified(let transaction) = result else { continue }
                var entry: [String: Any] = ["jwsTransaction": result.jwsRepresentation]
                if let product = try? await Product.products(for: [transaction.productID]).first {
                    if let renewalJws = await self.renewalJws(for: product) {
                        entry["jwsRenewalInfo"] = renewalJws
                    }
                }
                transactions.append(entry)
            }
            call.resolve(["transactions": transactions])
        }
    }

    // MARK: sync (explicit Restore only — NEVER at launch)

    // Forces a StoreKit account sync. This can present a sign-in prompt, so it must
    // only be invoked in direct response to the user tapping "Restore Purchases"
    // (the JS restore flow calls this only when currentEntitlements is empty).
    @objc func sync(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve()
            } catch {
                call.reject("sync failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: manageSubscriptions

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
                ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
            else {
                call.reject("no active window scene")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject("manageSubscriptions failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: helpers

    /// The signed renewal-info JWS for a subscription product's current status.
    private func renewalJws(for product: Product) async -> String? {
        guard let statuses = try? await product.subscription?.status else { return nil }
        guard let status = statuses.first else { return nil }
        return status.renewalInfo.jwsRepresentation
    }
}
