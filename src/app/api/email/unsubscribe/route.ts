// Public, token-based unsubscribe. Supports both:
//   • GET  — a human clicking the footer link → flips opt-out, shows a page.
//   • POST — RFC 8058 one-click (List-Unsubscribe-Post) → flips opt-out, 200.
// No auth: the per-user token IS the authorization, and it can only ever turn
// marketing OFF (never on), so a leaked token is low-risk.

export const runtime = "nodejs";

import { unsubscribeByToken } from "@/lib/email/store";

function tokenFrom(request: Request): string {
  return new URL(request.url).searchParams.get("token") ?? "";
}

function page(found: boolean): string {
  const msg = found
    ? "You've been unsubscribed from NoteDrift product emails. You'll still get essential account emails (like sign-in codes)."
    : "This unsubscribe link is no longer valid. If you keep receiving emails, contact support@notedrift.com.";
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Unsubscribe · NoteDrift</title></head>
<body style="margin:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b0c11">
<div style="max-width:460px;margin:12vh auto;padding:28px;background:#fff;border:1px solid #e6e8ec;border-radius:16px">
<div style="font-size:18px;font-weight:700;margin-bottom:10px">NoteDrift</div>
<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px">${msg}</p>
<a href="https://notedrift.com/" style="color:#3d7bff;text-decoration:none;font-weight:600">Back to NoteDrift →</a>
</div></body></html>`;
}

export async function POST(request: Request): Promise<Response> {
  await unsubscribeByToken(tokenFrom(request));
  // One-click clients only need a 2xx.
  return new Response("ok", { status: 200 });
}

export async function GET(request: Request): Promise<Response> {
  const found = await unsubscribeByToken(tokenFrom(request));
  return new Response(page(found), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
