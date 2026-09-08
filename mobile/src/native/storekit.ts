// Bridge to the first-party StoreKit 2 Capacitor plugin (Swift, in
// ios/App/App/plugins/StoreKit). Adapts it to the shared NativeBilling seam so the
// UI (UpgradeDialog/AccountButton) drives purchases without importing Capacitor.
import { registerPlugin } from "@capacitor/core";
import {
  setNativeBilling,
  type NativeBilling,
  type NativeProduct,
  type NativePurchaseResult,
  type NativeTransaction,
} from "@/lib/billing/native";
import { intervalForAppleProduct } from "@/lib/billing/apple/products";
import { isNativeIos } from "@/lib/platform";

interface StoreKitProduct {
  id: string;
  displayName: string;
  displayPrice: string;
}
interface StoreKitTransaction {
  jwsTransaction: string;
  jwsRenewalInfo?: string;
}
interface StoreKitPlugin {
  getProducts(options: { productIds: string[] }): Promise<{ products: StoreKitProduct[] }>;
  purchase(options: {
    productId: string;
    appAccountToken: string;
  }): Promise<{ outcome: string; jwsTransaction?: string; jwsRenewalInfo?: string; message?: string }>;
  currentEntitlements(): Promise<{ transactions: StoreKitTransaction[] }>;
  manageSubscriptions(): Promise<void>;
}

const StoreKit = registerPlugin<StoreKitPlugin>("NoteDriftStoreKit");

const OUTCOMES = new Set<NativePurchaseResult["outcome"]>([
  "success",
  "cancelled",
  "pending",
  "failed",
]);

export function registerStoreKitBilling(): void {
  if (!isNativeIos()) return;

  const impl: NativeBilling = {
    async getProducts(ids) {
      const { products } = await StoreKit.getProducts({ productIds: ids });
      return products.map(
        (p): NativeProduct => ({
          id: p.id,
          displayName: p.displayName,
          displayPrice: p.displayPrice,
          interval: intervalForAppleProduct(p.id),
        }),
      );
    },
    async purchase(productId, appAccountToken) {
      const r = await StoreKit.purchase({ productId, appAccountToken });
      const outcome = OUTCOMES.has(r.outcome as NativePurchaseResult["outcome"])
        ? (r.outcome as NativePurchaseResult["outcome"])
        : "failed";
      return {
        outcome,
        signedTransaction: r.jwsTransaction,
        signedRenewalInfo: r.jwsRenewalInfo,
        message: r.message,
      };
    },
    async currentEntitlements() {
      const { transactions } = await StoreKit.currentEntitlements();
      return transactions.map(
        (t): NativeTransaction => ({
          signedTransaction: t.jwsTransaction,
          signedRenewalInfo: t.jwsRenewalInfo,
        }),
      );
    },
    async manageSubscriptions() {
      await StoreKit.manageSubscriptions();
    },
  };

  setNativeBilling(impl);
}
