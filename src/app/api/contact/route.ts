import { createHash } from "node:crypto";
import { z } from "zod";
import { emailConfigured, sendEmail, siteUrlFrom } from "@/lib/mailer";
import { buildContactAutoReply, buildContactNotification } from "@/lib/emails";
import { callSupabaseFunction } from "@/lib/supabase";

// POST /api/contact {name, email, company?, message, website?}
// Saves the message in Supabase first (so nothing is lost), then emails an automatic reply to
// the sender and a notification to CONTACT_NOTIFY_EMAIL. "website" is a hidden honeypot field:
// people leave it empty, spam bots fill it. At most 3 messages per sender per hour.
const Body = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  email: z.email("That doesn't look like an email address.").trim().max(120),
  company: z.string().trim().max(120).optional().default(""),
  message: z.string().trim().min(10, "Please write a little more (at least 10 characters).").max(3000),
  website: z.string().max(200).optional().default(""),
});

function ipHash(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.GEM_COLLECT_SECRET?.trim() || "gobid";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  const m = parsed.data;
  // A bot filled the hidden field: pretend it worked, save and send nothing.
  if (m.website) return Response.json({ ok: true, emailed: false });

  let id: number | null;
  try {
    const saved = await callSupabaseFunction<number | null>("save_contact_message", {
      p_name: m.name,
      p_email: m.email,
      p_company: m.company,
      p_message: m.message,
      p_ip_hash: ipHash(req),
    });
    if (saved === null) return Response.json({ error: "The contact form isn't set up yet. Please try again later." }, { status: 503 });
    id = saved;
  } catch (e) {
    console.error("contact save failed:", (e as Error).message.slice(0, 200));
    return Response.json({ error: "We couldn't save your message. Please try again in a minute." }, { status: 502 });
  }
  if (id == null) return Response.json({ error: "You've sent a few messages already. Please wait an hour and try again." }, { status: 429 });

  const msg = { id, name: m.name, email: m.email, company: m.company || null, message: m.message };
  let autoReplied = false;
  let notified = false;
  if (emailConfigured()) {
    try {
      await sendEmail(m.email, buildContactAutoReply(msg, { siteUrl: siteUrlFrom(req) }));
      autoReplied = true;
    } catch (e) {
      console.error("contact auto-reply failed:", (e as Error).message.slice(0, 200));
    }
    const team = process.env.CONTACT_NOTIFY_EMAIL?.trim();
    if (team) {
      try {
        await sendEmail(team, buildContactNotification(msg), { replyTo: { email: m.email, name: m.name } });
        notified = true;
      } catch (e) {
        console.error("contact notification failed:", (e as Error).message.slice(0, 200));
      }
    }
    await callSupabaseFunction("mark_contact_emailed", { p_id: id, p_auto_replied: autoReplied, p_notified: notified }).catch(() => null);
  }
  return Response.json({ ok: true, id, emailed: autoReplied });
}
