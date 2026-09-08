import "server-only";

// Cryptographic verification of Apple signed payloads via Apple's OFFICIAL server
// library (@apple/app-store-server-library) — never home-grown JWS parsing, never
// receipt parsing in JS. Verifies signature + certificate chain + expiration, then
// enforces bundleId and the product allowlist. appAccountToken -> user mapping is
// enforced by the CALLER (the verify route) against the authenticated user.

import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { APPLE_BUNDLE_ID, isApprovedAppleProduct } from "./products";
import { appleBundleAllowed } from "./guards";
import {
  appleAppAppleId,
  appleOnlineChecksEnabled,
  appleRootCertificates,
  isAppleIapConfigured,
} from "./config";
import {
  toAppleEntitlement,
  type AppleEntitlement,
  type AppleRenewalLike,
  type AppleTransactionLike,
} from "./entitlement";

export class AppleVerifyError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AppleVerifyError";
  }
}

const verifierCache = new Map<Environment, SignedDataVerifier>();

function verifierFor(env: Environment): SignedDataVerifier {
  let v = verifierCache.get(env);
  if (!v) {
    v = new SignedDataVerifier(
      appleRootCertificates(),
      appleOnlineChecksEnabled(),
      env,
      APPLE_BUNDLE_ID,
      appleAppAppleId(),
    );
    verifierCache.set(env, v);
  }
  return v;
}

function envFromString(s: string | undefined): Environment {
  return s === "Sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
}

/** Verify a device-supplied signed transaction. Tries Production then Sandbox so a
 *  sandbox/TestFlight build's transactions also verify; the decoded payload's own
 *  `environment` is authoritative thereafter. */
async function verifySignedTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
  if (!isAppleIapConfigured()) throw new AppleVerifyError("unconfigured");
  for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      return await verifierFor(env).verifyAndDecodeTransaction(jws);
    } catch {
      /* try the other environment */
    }
  }
  throw new AppleVerifyError("verification_failed");
}

export interface VerifiedTransaction {
  entitlement: AppleEntitlement;
  raw: JWSTransactionDecodedPayload;
}

/** Verify a device transaction (+ optional renewal) and produce the storable
 *  entitlement. Enforces bundleId and product allowlist. Throws AppleVerifyError. */
export async function verifyDeviceTransaction(
  signedTransaction: string,
  signedRenewalInfo?: string,
): Promise<VerifiedTransaction> {
  const tx = await verifySignedTransaction(signedTransaction);
  if (!appleBundleAllowed(tx.bundleId)) throw new AppleVerifyError("bundle_mismatch");
  if (!isApprovedAppleProduct(tx.productId)) throw new AppleVerifyError("product_not_allowed");

  let renewal: JWSRenewalInfoDecodedPayload | undefined;
  if (signedRenewalInfo) {
    try {
      renewal = await verifierFor(envFromString(tx.environment)).verifyAndDecodeRenewalInfo(
        signedRenewalInfo,
      );
    } catch {
      /* renewal info is optional context, not required to grant */
    }
  }

  const entitlement = toAppleEntitlement(
    tx as AppleTransactionLike,
    renewal as AppleRenewalLike | undefined,
  );
  if (!entitlement) throw new AppleVerifyError("invalid_transaction");
  return { entitlement, raw: tx };
}

/** Verify an App Store Server Notification (V2) signed payload. Returns the
 *  decoded notification; the inner transaction/renewal is decoded separately with
 *  the notification's own environment. */
export async function verifyNotificationPayload(
  signedPayload: string,
): Promise<ResponseBodyV2DecodedPayload> {
  if (!isAppleIapConfigured()) throw new AppleVerifyError("unconfigured");
  for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      return await verifierFor(env).verifyAndDecodeNotification(signedPayload);
    } catch {
      /* try the other environment */
    }
  }
  throw new AppleVerifyError("verification_failed");
}

/** Decode the inner transaction/renewal carried by a verified notification. */
export async function verifyNotificationTransaction(
  environment: string | undefined,
  signedTransactionInfo: string,
  signedRenewalInfo?: string,
): Promise<VerifiedTransaction> {
  const verifier = verifierFor(envFromString(environment));
  const tx = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
  if (!appleBundleAllowed(tx.bundleId)) throw new AppleVerifyError("bundle_mismatch");
  if (!isApprovedAppleProduct(tx.productId)) throw new AppleVerifyError("product_not_allowed");

  let renewal: JWSRenewalInfoDecodedPayload | undefined;
  if (signedRenewalInfo) {
    try {
      renewal = await verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo);
    } catch {
      /* optional */
    }
  }
  const entitlement = toAppleEntitlement(
    tx as AppleTransactionLike,
    renewal as AppleRenewalLike | undefined,
  );
  if (!entitlement) throw new AppleVerifyError("invalid_transaction");
  return { entitlement, raw: tx };
}
