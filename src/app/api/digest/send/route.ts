import { timingSafeEqual } from "node:crypto";
import { brevoConfigured, sendEmail } from "@/lib/brevo";
import { buildDigestEmail, type DigestBid } from "@/lib/digest";
import { callSupabaseFunction } from "@/lib/supabase";

// POST /api/digest/send: emails every user with alerts on their daily update. Called at
// 8:00 AM India time by the n8n "GoBid daily digest" workflow, with the same header secret as
// the collector (x-gobid-secret = GEM_COLLECT_SECRET). A user already emailed in the last
// 20 hours is skipped, so a retry never double-sends.
//   ?dry=1  build the emails and report counts, send nothing
export const maxDuration = 300;

type Recipient = { user_id: string; email: string; categories: string[]; keywords: string[]; last_sent_at: string | null; unsubscribe_token: string };

function secretMatches(given: string | null) {
  const expected = process.env.GEM_COLLECT_SECRET?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("x-gobid-secret"))) {
    return Response.json({ error: "Wrong or missing x-gobid-secret header." }, { status: 401 });
  }
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  if (!dry && !brevoConfigured()) {
    return Response.json({ error: "Email isn't set up: add BREVO_API_KEY and BREVO_SENDER_EMAIL." }, { status: 503 });
  }
  const siteUrl = (process.env.SITE_URL?.trim() || url.origin).replace(/\/$/, "");

  const recipients = await callSupabaseFunction<Recipient[]>("get_digest_recipients", {});
  if (recipients === null) return Response.json({ error: "Supabase isn't set up yet." }, { status: 503 });

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const r of recipients) {
    try {
      const bids = (await callSupabaseFunction<DigestBid[]>("digest_tenders", {
        p_categories: r.categories,
        p_keywords: r.keywords,
        p_since: r.last_sent_at,
      }))!;
      const unsubscribeUrl = `${siteUrl}/api/alerts/unsubscribe?token=${r.unsubscribe_token}`;
      const email = buildDigestEmail({ bids, topics: [...r.categories, ...r.keywords], siteUrl, unsubscribeUrl });
      if (!email) {
        skipped++;
        continue;
      }
      if (!dry) {
        await sendEmail(r.email, email, unsubscribeUrl);
        await callSupabaseFunction("mark_digest_sent", { p_user_id: r.user_id });
      }
      sent++;
    } catch (e) {
      // One bad address or Brevo hiccup shouldn't stop everyone else's email.
      failures.push(`${r.email.replace(/(.).*@/, "$1…@")}: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  if (!dry) {
    await callSupabaseFunction("log_digest_run", { p_recipients: recipients.length, p_sent: sent, p_skipped: skipped, p_failed: failures.length }).catch(() => null);
  }
  return Response.json({ dry, recipients: recipients.length, sent, skipped_nothing_new: skipped, failed: failures.length, failures });
}
