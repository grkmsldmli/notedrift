// Email template tests. Run with `npm test`. Pure — no send, no secrets.
// Guards the compliance-critical invariants: marketing mail carries an
// unsubscribe link, transactional mail does not, subjects/CTAs are correct, and
// the OTP code is rendered (and sanitized) without leaking anything else.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  otpEmail,
  welcomeEmail,
  discoveryEmail,
  cloudLimitEmail,
  exportIntentEmail,
  dormantEmail,
  newsletterEmail,
  proWelcomeEmail,
  cancellationEmail,
  winbackEmail,
  EMAIL_CLASSIFICATION,
  fromFor,
  replyToFor,
} from "./templates.ts";

const UNSUB = "https://notedrift.com/api/email/unsubscribe?token=abc";

test("OTP email renders the sanitized 6-digit code and is transactional", () => {
  const e = otpEmail("053023");
  assert.equal(e.subject, "Your NoteDrift sign-in code");
  assert.ok(e.html.includes("053023"));
  assert.ok(e.text.includes("053023"));
  // sanitizes junk / truncates
  assert.ok(otpEmail("05-30-23xx").html.includes("053023"));
  // transactional → no unsubscribe
  assert.ok(!/unsubscribe/i.test(e.html));
});

test("marketing emails ALL include the unsubscribe link", () => {
  const marketing = [
    discoveryEmail({ unsubscribeUrl: UNSUB }),
    cloudLimitEmail({ unsubscribeUrl: UNSUB }),
    exportIntentEmail({ unsubscribeUrl: UNSUB }),
    dormantEmail({ unsubscribeUrl: UNSUB }),
    newsletterEmail({ unsubscribeUrl: UNSUB }),
    winbackEmail({ unsubscribeUrl: UNSUB }),
  ];
  for (const e of marketing) {
    assert.ok(e.html.includes(UNSUB), `missing unsubscribe: ${e.subject}`);
    assert.match(e.html, /unsubscribe/i);
  }
});

test("transactional emails NEVER include an unsubscribe link", () => {
  for (const e of [welcomeEmail(), proWelcomeEmail(), cancellationEmail({ endDate: "May 1, 2026" })]) {
    assert.ok(!/unsubscribe/i.test(e.html), `transactional email has unsubscribe: ${e.subject}`);
  }
});

test("classification matches the compliance model", () => {
  assert.equal(EMAIL_CLASSIFICATION.otp, "transactional");
  assert.equal(EMAIL_CLASSIFICATION.welcome, "transactional");
  assert.equal(EMAIL_CLASSIFICATION["pro-welcome"], "transactional");
  assert.equal(EMAIL_CLASSIFICATION.cancellation, "transactional");
  assert.equal(EMAIL_CLASSIFICATION.discovery, "marketing");
  assert.equal(EMAIL_CLASSIFICATION["cloud-limit"], "marketing");
  assert.equal(EMAIL_CLASSIFICATION["export-intent"], "marketing");
  assert.equal(EMAIL_CLASSIFICATION.dormant, "marketing");
  assert.equal(EMAIL_CLASSIFICATION.newsletter, "marketing");
  assert.equal(EMAIL_CLASSIFICATION.winback, "marketing");
});

test("from/reply-to: only OTP is no-reply; everything else routes to support", () => {
  assert.match(fromFor("otp"), /noreply@notedrift\.com/);
  assert.equal(replyToFor("otp"), undefined);
  for (const k of ["welcome", "pro-welcome", "discovery", "newsletter", "cancellation"] as const) {
    assert.match(fromFor(k), /hello@notedrift\.com/);
    assert.equal(replyToFor(k), "support@notedrift.com");
  }
});

test("conversion emails point at the upgrade deep-link; pricing stays canonical", () => {
  for (const e of [
    cloudLimitEmail({ unsubscribeUrl: UNSUB }),
    exportIntentEmail({ unsubscribeUrl: UNSUB }),
    winbackEmail({ unsubscribeUrl: UNSUB }),
  ]) {
    assert.match(e.html, /\/\?upgrade=1/);
  }
  assert.ok(cloudLimitEmail({ unsubscribeUrl: UNSUB }).html.includes("$3.99"));
  assert.ok(winbackEmail({ unsubscribeUrl: UNSUB }).text.includes("$29.99"));
});

test("cancellation email states the end date", () => {
  const e = cancellationEmail({ endDate: "May 1, 2026" });
  assert.ok(e.html.includes("May 1, 2026"));
  // graceful fallback when no date
  assert.ok(cancellationEmail({ endDate: "" }).html.includes("the end of your billing period"));
});

test("every template has subject, preheader, html and text", () => {
  const all = [
    otpEmail("123456"),
    welcomeEmail(),
    discoveryEmail({ unsubscribeUrl: UNSUB }),
    cloudLimitEmail({ unsubscribeUrl: UNSUB }),
    exportIntentEmail({ unsubscribeUrl: UNSUB }),
    dormantEmail({ unsubscribeUrl: UNSUB }),
    newsletterEmail({ unsubscribeUrl: UNSUB }),
    proWelcomeEmail(),
    cancellationEmail({ endDate: "x" }),
    winbackEmail({ unsubscribeUrl: UNSUB }),
  ];
  for (const e of all) {
    assert.ok(e.subject.length > 0);
    assert.ok(e.preheader.length > 0);
    assert.ok(e.html.startsWith("<!doctype html>"));
    assert.ok(e.text.length > 0);
  }
});
