import { callSupabaseFunction } from "@/lib/supabase";

// GET /api/alerts/unsubscribe?token=…: the "Unsubscribe" link in every digest email.
// Turns the user's daily email off and shows a short confirmation page.
function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · GoBid</title></head>
<body style="font-family:Arial,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;color:#111827">
<h1 style="font-size:22px">${title}</h1><p style="color:#374151">${body}</p>
<p><a href="/alerts" style="color:#1d4ed8">Email alert settings</a> · <a href="/" style="color:#1d4ed8">GoBid tenders</a></p></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function unsubscribe(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return page("Link not valid", "This unsubscribe link is incomplete. Open it again from the email.", 400);
  try {
    const email = await callSupabaseFunction<string | null>("unsubscribe_alerts", { p_token: token });
    if (!email || typeof email !== "string") return page("Link not valid", "We couldn't find these alerts. They may already be removed.", 404);
    return page("You're unsubscribed", `Daily emails to ${email.replace(/&/g, "&amp;").replace(/</g, "&lt;")} are now off. You can turn them back on any time after signing in.`);
  } catch {
    return page("Something went wrong", "Please try the link again in a minute.", 502);
  }
}

export const GET = unsubscribe;
// Email apps' one-click unsubscribe sends a POST to the same link.
export const POST = unsubscribe;
