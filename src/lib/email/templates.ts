// NoteDrift email templates — PURE functions returning { subject, preheader,
// html, text }. No secrets, no server-only, so they are unit-tested. Voice:
// minimal, a little colorful, curious, short, ONE call to action. Every template
// uses the shared branded layout.
//
// Classification drives compliance + gating:
//   • transactional (otp, welcome, pro-welcome, cancellation): sent regardless of
//     marketing opt-in; NO unsubscribe footer.
//   • marketing (discovery, cloud-limit, export-intent, dormant, newsletter,
//     winback): sent ONLY to opted-in users; unsubscribe footer + the sender adds
//     List-Unsubscribe headers.

import { EMAIL_FROM, SUPPORT_EMAIL, emailUrl } from "./config.ts";

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export type EmailKind =
  | "otp"
  | "welcome"
  | "discovery"
  | "cloud-limit"
  | "export-intent"
  | "dormant"
  | "newsletter"
  | "pro-welcome"
  | "cancellation"
  | "winback";

export const EMAIL_CLASSIFICATION: Record<EmailKind, "transactional" | "marketing"> = {
  otp: "transactional",
  welcome: "transactional",
  "pro-welcome": "transactional",
  cancellation: "transactional",
  discovery: "marketing",
  "cloud-limit": "marketing",
  "export-intent": "marketing",
  dormant: "marketing",
  newsletter: "marketing",
  winback: "marketing",
};

/** From address by kind: ONLY OTP uses the no-reply auth address; every other
 *  product/lifecycle email comes from hello@ so a reply reaches a real inbox. */
export function fromFor(kind: EmailKind): string {
  return kind === "otp" ? EMAIL_FROM.auth : EMAIL_FROM.marketing;
}

/** Reply-To by kind: hello@ mail routes replies to the monitored support inbox;
 *  the no-reply OTP mail has none. */
export function replyToFor(kind: EmailKind): string | undefined {
  return kind === "otp" ? undefined : SUPPORT_EMAIL;
}

/* ------------------------------ tiny HTML kit ----------------------------- */

const C = {
  bg: "#f5f6f8",
  card: "#ffffff",
  text: "#0b0c11",
  muted: "#6b7280",
  border: "#e6e8ec",
  accentA: "#7c5cff",
  accentB: "#3d7bff",
};
const font =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,${C.accentA},${C.accentB});color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:10px;font-family:${font}">${esc(label)}</a>`;
}

function layout(opts: {
  preheader: string;
  bodyHtml: string;
  unsubscribeUrl?: string;
}): string {
  const foot = opts.unsubscribeUrl
    ? `You're receiving product emails from NoteDrift. <a href="${opts.unsubscribeUrl}" style="color:${C.muted};text-decoration:underline">Unsubscribe</a> · <a href="mailto:${SUPPORT_EMAIL}" style="color:${C.muted};text-decoration:underline">${SUPPORT_EMAIL}</a><br/>NoteDrift · notedrift.com`
    : `Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${C.muted};text-decoration:underline">${SUPPORT_EMAIL}</a> · NoteDrift · notedrift.com`;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:${C.bg};font-family:${font};color:${C.text}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="padding:4px 4px 18px">
<span style="font-size:18px;font-weight:700;letter-spacing:-.2px">Note<span style="background:linear-gradient(135deg,${C.accentA},${C.accentB});-webkit-background-clip:text;background-clip:text;color:${C.accentA}">Drift</span></span>
</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:28px">
${opts.bodyHtml}
</td></tr>
<tr><td style="padding:16px 6px;color:${C.muted};font-size:12px;line-height:1.6">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}

const h1 = (t: string) =>
  `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:700">${esc(t)}</h1>`;
const p = (t: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.text}">${t}</p>`;
const muted = (t: string) =>
  `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.muted}">${t}</p>`;
const bullets = (items: string[]) =>
  `<div style="margin:0 0 16px">${items
    .map(
      (i) =>
        `<div style="font-size:15px;line-height:1.7;color:${C.text}"><span style="color:${C.accentA}">✦</span> ${i}</div>`,
    )
    .join("")}</div>`;
const cta = (label: string, href: string) =>
  `<div style="margin:18px 0 2px">${button(label, href)}</div>`;

const APP = emailUrl("/");
const UPGRADE = emailUrl("/?upgrade=1");
const TOOLS = emailUrl("/tools");

/* -------------------------------- templates ------------------------------- */

export function otpEmail(code: string): RenderedEmail {
  const clean = code.replace(/\D/g, "").slice(0, 6);
  return {
    subject: "Your NoteDrift sign-in code",
    preheader: "Your workspace is waiting.",
    html: layout({
      preheader: "Your workspace is waiting.",
      bodyHtml:
        h1("Your sign-in code") +
        `<div style="font-size:34px;font-weight:800;letter-spacing:10px;padding:14px 0 6px">${esc(clean)}</div>` +
        muted("Drop it into NoteDrift and you're in.") +
        muted("No password. No clutter.") +
        cta("Open NoteDrift", APP),
    }),
    text: `Your NoteDrift sign-in code: ${clean}\n\nDrop it into NoteDrift and you're in. No password. No clutter.\n${APP}`,
  };
}

export function welcomeEmail(): RenderedEmail {
  return {
    subject: "Your blank page is ready ✦",
    preheader: "Open. Think. Create.",
    html: layout({
      preheader: "Open. Think. Create.",
      bodyHtml:
        h1("Welcome to NoteDrift.") +
        p("Sometimes you don't need another productivity system. You just need somewhere to think.") +
        p("That's NoteDrift.") +
        muted("Draw. Write. Drop in an image. Export it. Or leave it messy. Your local canvases are unlimited, and your account gives you 3 cloud canvases free.") +
        cta("Open your page", APP) +
        muted("Open. Think. Create."),
    }),
    text: `Welcome to NoteDrift.\n\nSometimes you don't need another productivity system. You just need somewhere to think. That's NoteDrift.\n\nDraw. Write. Drop in an image. Export it. Your local canvases are unlimited; your account gives you 3 cloud canvases free.\n\nOpen your page: ${APP}`,
  };
}

export function discoveryEmail(o: { unsubscribeUrl: string }): RenderedEmail {
  return {
    subject: "3 things you might not know NoteDrift does",
    preheader: "Your blank page has a few tricks.",
    html: layout({
      preheader: "Your blank page has a few tricks.",
      unsubscribeUrl: o.unsubscribeUrl,
      bodyHtml:
        h1("Your page can do more than look blank.") +
        bullets([
          "Drop images directly onto the canvas",
          "Export your work as PNG or PDF",
          "Save canvases to the cloud and reopen them later",
        ]) +
        muted("Nothing to configure.") +
        cta("Try it", APP),
    }),
    text: `Your page can do more than look blank.\n\n- Drop images directly onto the canvas\n- Export your work as PNG or PDF\n- Save canvases to the cloud and reopen them later\n\nTry it: ${APP}`,
  };
}

export function cloudLimitEmail(o: { unsubscribeUrl: string }): RenderedEmail {
  return {
    subject: "Your 3 cloud spots are full ☁️",
    preheader: "Your local canvases are still unlimited.",
    html: layout({
      preheader: "Your local canvases are still unlimited.",
      unsubscribeUrl: o.unsubscribeUrl,
      bodyHtml:
        h1("You've filled your free cloud space.") +
        p("Nothing is locked. Keep creating locally as much as you want.") +
        muted("When you want unlimited cloud space, cross-device access, professional exports — and no ads — that's what Pro is for.") +
        cta("Go Pro — $3.99/month", UPGRADE) +
        muted("Or save more with $29.99/year."),
    }),
    text: `You've filled your free cloud space.\n\nNothing is locked — keep creating locally as much as you want. When you want unlimited cloud, cross-device access, professional exports and no ads, that's Pro.\n\nGo Pro ($3.99/month or $29.99/year): ${UPGRADE}`,
  };
}

export function exportIntentEmail(o: { unsubscribeUrl: string }): RenderedEmail {
  return {
    subject: "That export can look even better",
    preheader: "HD, 4K, transparent PNG, SVG and more.",
    html: layout({
      preheader: "HD, 4K, transparent PNG, SVG and more.",
      unsubscribeUrl: o.unsubscribeUrl,
      bodyHtml:
        h1("You made it. Now export it properly.") +
        p("NoteDrift Pro unlocks:") +
        bullets([
          "HD + 4K PNG",
          "Transparent PNG",
          "SVG",
          "Selection export",
          "Custom sizes",
          "Multi-page PDF",
        ]) +
        muted("Plus unlimited cloud and an ad-free workspace.") +
        cta("Unlock Pro", UPGRADE),
    }),
    text: `You made it. Now export it properly.\n\nNoteDrift Pro unlocks HD + 4K PNG, transparent PNG, SVG, selection export, custom sizes and multi-page PDF — plus unlimited cloud and an ad-free workspace.\n\nUnlock Pro: ${UPGRADE}`,
  };
}

export function dormantEmail(o: { unsubscribeUrl: string }): RenderedEmail {
  return {
    subject: "Your page is still here",
    preheader: "No feeds. No notifications. Just your space.",
    html: layout({
      preheader: "No feeds. No notifications. Just your space.",
      unsubscribeUrl: o.unsubscribeUrl,
      bodyHtml:
        h1("Remember NoteDrift?") +
        muted("We haven't added a streak.") +
        muted("We haven't sent you 14 notifications.") +
        muted("We haven't turned your blank page into a dashboard.") +
        p("It's still just a place to think.") +
        cta("Open NoteDrift", APP),
    }),
    text: `Remember NoteDrift?\n\nWe haven't added a streak. We haven't sent you 14 notifications. We haven't turned your blank page into a dashboard.\n\nIt's still just a place to think.\n\nOpen NoteDrift: ${APP}`,
  };
}

export function newsletterEmail(o: { unsubscribeUrl: string }): RenderedEmail {
  return {
    subject: "3 free tools worth bookmarking",
    preheader: "No signup. Files stay on your device.",
    html: layout({
      preheader: "No signup. Files stay on your device.",
      unsubscribeUrl: o.unsubscribeUrl,
      bodyHtml:
        h1("Useful things. No nonsense.") +
        p("This week on NoteDrift:") +
        bullets([
          "<b>Compress an image</b> — smaller file, same sanity.",
          "<b>Edit a PDF</b> — in your browser, nothing uploaded.",
          "<b>Tap BPM</b> — tap, get the tempo.",
        ]) +
        cta("See all free tools", TOOLS),
    }),
    text: `Useful things. No nonsense. This week on NoteDrift:\n\n- Compress an image — smaller file, same sanity.\n- Edit a PDF — in your browser, nothing uploaded.\n- Tap BPM — tap, get the tempo.\n\nSee all free tools: ${TOOLS}`,
  };
}

export function proWelcomeEmail(): RenderedEmail {
  return {
    subject: "You're Pro ✦",
    preheader: "The ads are gone.",
    html: layout({
      preheader: "The ads are gone.",
      bodyHtml:
        h1("Welcome to NoteDrift Pro.") +
        p("Your workspace just got quieter.") +
        bullets([
          "No ads",
          "Unlimited cloud canvases",
          "Access across devices",
          "HD, 4K &amp; transparent PNG",
          "SVG, selection &amp; custom-size exports",
          "Multi-page PDF",
        ]) +
        muted("Nothing new to learn. Just more room to work.") +
        cta("Open NoteDrift", APP),
    }),
    text: `Welcome to NoteDrift Pro. Your workspace just got quieter.\n\n- No ads\n- Unlimited cloud canvases\n- Access across devices\n- HD, 4K & transparent PNG\n- SVG, selection & custom-size exports\n- Multi-page PDF\n\nOpen NoteDrift: ${APP}`,
  };
}

export function cancellationEmail(o: { endDate: string }): RenderedEmail {
  const end = o.endDate?.trim() || "the end of your billing period";
  return {
    subject: "Your Pro plan is set to end",
    preheader: "Your work isn't going anywhere.",
    html: layout({
      preheader: "Your work isn't going anywhere.",
      bodyHtml:
        h1("Your NoteDrift Pro subscription has been cancelled.") +
        p(`You'll keep Pro access until ${esc(end)}.`) +
        muted("Your local canvases remain yours regardless.") +
        p("Changed your mind?") +
        cta("Keep NoteDrift Pro", UPGRADE),
    }),
    text: `Your NoteDrift Pro subscription has been cancelled. You'll keep Pro access until ${end}. Your local canvases remain yours regardless.\n\nChanged your mind? Keep NoteDrift Pro: ${UPGRADE}`,
  };
}

export function winbackEmail(o: { unsubscribeUrl: string }): RenderedEmail {
  return {
    subject: "Want the quiet workspace back?",
    preheader: "Pro is still $3.99/month.",
    html: layout({
      preheader: "Pro is still $3.99/month.",
      unsubscribeUrl: o.unsubscribeUrl,
      bodyHtml:
        h1("A little less noise goes a long way.") +
        bullets(["Unlimited cloud.", "Professional exports.", "No ads."]) +
        muted("NoteDrift Pro is still $3.99/month or $29.99/year.") +
        cta("Come back to Pro", UPGRADE),
    }),
    text: `A little less noise goes a long way.\n\nUnlimited cloud. Professional exports. No ads. NoteDrift Pro is still $3.99/month or $29.99/year.\n\nCome back to Pro: ${UPGRADE}`,
  };
}
