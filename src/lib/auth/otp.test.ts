// 6-digit email OTP pure-logic tests: normalization, validation, and the
// provider-agnostic verify core. Run with `npm test`. No DOM, no network, no
// Supabase — the real provider call lives in client.ts (verifyEmailOtp) and is
// injected here as a fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OTP_LENGTH,
  normalizeOtpInput,
  isCompleteOtp,
  otpFriendlyError,
  verifyEmailOtpCore,
  type OtpVerifyParams,
} from "./otp.ts";
import { parseGoogleCredential } from "./google.ts";

/* ------------------------------ normalization ----------------------------- */

test("normalizeOtpInput keeps a clean 6-digit code intact", () => {
  assert.equal(normalizeOtpInput("123456"), "123456");
});

test("normalizeOtpInput strips spaces, dashes and label text (paste tolerance)", () => {
  assert.equal(normalizeOtpInput("12 34 56"), "123456");
  assert.equal(normalizeOtpInput("12-34-56"), "123456");
  assert.equal(normalizeOtpInput("code: 123456"), "123456");
  assert.equal(normalizeOtpInput("123456\n"), "123456");
});

test("normalizeOtpInput clamps to OTP_LENGTH (rejects >6 by truncation)", () => {
  assert.equal(normalizeOtpInput("1234567"), "123456");
  assert.equal(normalizeOtpInput("123456789"), "123456");
});

test("normalizeOtpInput drops letters, leaving only digits", () => {
  assert.equal(normalizeOtpInput("abcdef"), "");
  assert.equal(normalizeOtpInput("12a45"), "1245");
});

/* ------------------------------- validation ------------------------------- */

test("isCompleteOtp accepts exactly six digits", () => {
  assert.equal(isCompleteOtp("123456"), true);
  assert.equal(isCompleteOtp("000000"), true);
});

test("isCompleteOtp rejects fewer than six digits", () => {
  assert.equal(isCompleteOtp(""), false);
  assert.equal(isCompleteOtp("123"), false);
  assert.equal(isCompleteOtp("12345"), false);
});

test("isCompleteOtp rejects more than six digits", () => {
  assert.equal(isCompleteOtp("1234567"), false);
});

test("isCompleteOtp rejects letters and mixed content", () => {
  assert.equal(isCompleteOtp("12345a"), false);
  assert.equal(isCompleteOtp("abcdef"), false);
  assert.equal(isCompleteOtp("12 456"), false);
});

test("OTP_LENGTH is six", () => {
  assert.equal(OTP_LENGTH, 6);
});

/* ---------------------------- friendly errors ----------------------------- */

test("otpFriendlyError maps invalid/expired to the safe generic (never raw)", () => {
  assert.equal(
    otpFriendlyError("Token has expired or is invalid"),
    "That code is invalid or expired. Try again.",
  );
  assert.equal(otpFriendlyError("otp_expired"), "That code is invalid or expired. Try again.");
});

test("otpFriendlyError distinguishes rate-limit and network", () => {
  assert.match(otpFriendlyError("Too many requests"), /wait a moment/i);
  assert.match(otpFriendlyError("rate limit exceeded"), /wait a moment/i);
  assert.match(otpFriendlyError("Failed to fetch"), /connection/i);
});

/* ---------------------------- verifyEmailOtpCore --------------------------- */

/** A fake verifier that records the params it was called with. */
function fakeVerifier(result: { error: { message: string } | null }) {
  const calls: OtpVerifyParams[] = [];
  const verify = async (params: OtpVerifyParams) => {
    calls.push(params);
    return result;
  };
  return { verify, calls };
}

test("verifyEmailOtpCore calls the provider with type='email' and normalized inputs", async () => {
  const { verify, calls } = fakeVerifier({ error: null });
  const res = await verifyEmailOtpCore(verify, "  User@Example.COM ", "123456");
  assert.deepEqual(res, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "email");
  assert.equal(calls[0].email, "user@example.com"); // trimmed + lowercased
  assert.equal(calls[0].token, "123456");
});

test("verifyEmailOtpCore normalizes a pasted token before the provider call", async () => {
  const { verify, calls } = fakeVerifier({ error: null });
  const res = await verifyEmailOtpCore(verify, "a@b.co", "12 34 56");
  assert.deepEqual(res, { ok: true });
  assert.equal(calls[0].token, "123456");
});

test("verifyEmailOtpCore returns ok on a successful verification", async () => {
  const { verify } = fakeVerifier({ error: null });
  const res = await verifyEmailOtpCore(verify, "a@b.co", "654321");
  assert.equal(res.ok, true);
});

test("verifyEmailOtpCore rejects <6 digits WITHOUT calling the provider", async () => {
  const { verify, calls } = fakeVerifier({ error: null });
  const res = await verifyEmailOtpCore(verify, "a@b.co", "123");
  assert.equal(res.ok, false);
  assert.equal(calls.length, 0); // provider never touched
});

test("verifyEmailOtpCore rejects letters (nothing valid to verify), no provider call", async () => {
  const { verify, calls } = fakeVerifier({ error: null });
  const res = await verifyEmailOtpCore(verify, "a@b.co", "12ab56");
  assert.equal(res.ok, false);
  assert.equal(calls.length, 0);
});

test("verifyEmailOtpCore rejects >6 digits by clamping — still verifies the 6 it kept", async () => {
  // Clamp semantics: a 6-digit prefix is a valid code; assert the provider sees 6.
  const { verify, calls } = fakeVerifier({ error: null });
  await verifyEmailOtpCore(verify, "a@b.co", "1234567");
  assert.equal(calls[0].token, "123456");
});

test("verifyEmailOtpCore maps a provider error to a friendly message (never raw)", async () => {
  const { verify } = fakeVerifier({ error: { message: "Token has expired or is invalid" } });
  const res = await verifyEmailOtpCore(verify, "a@b.co", "111111");
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.error, "That code is invalid or expired. Try again.");
});

test("verifyEmailOtpCore treats a thrown provider error as a network problem", async () => {
  const throwing = async () => {
    throw new Error("boom");
  };
  const res = await verifyEmailOtpCore(throwing, "a@b.co", "222222");
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && /connection/i.test(res.error), true);
});

/* --------------------------- google flow unchanged ------------------------ */
// The OTP work touches only the email path. The Google ID-token primitive lives
// in google.ts and is intentionally NOT modified — this canary fails if the
// credential→ID-token parsing that feeds signInWithGoogleIdToken ever regresses.
test("Google ID-token sign-in path is unchanged (credential still parses)", () => {
  const ok = parseGoogleCredential({ credential: "eyJ.header.sig" });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok === true && ok.credential, "eyJ.header.sig");
  assert.equal(parseGoogleCredential({ credential: "" }).ok, false);
});

test("verifyEmailOtpCore never logs the token", async () => {
  const seen: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = (...a: unknown[]) => seen.push(a.join(" "));
  console.error = (...a: unknown[]) => seen.push(a.join(" "));
  console.warn = (...a: unknown[]) => seen.push(a.join(" "));
  console.info = (...a: unknown[]) => seen.push(a.join(" "));
  try {
    await verifyEmailOtpCore(
      fakeVerifier({ error: { message: "Token has expired or is invalid" } }).verify,
      "a@b.co",
      "424242",
    );
  } finally {
    Object.assign(console, orig);
  }
  assert.equal(seen.some((line) => line.includes("424242")), false);
});
