import "server-only";
import nodemailer from "nodemailer";

// Sends one email. Two ways, chosen by which settings are present:
//   Gmail  GMAIL_USER + GMAIL_APP_PASSWORD (a Google "app password", not the normal password).
//          Good for testing: about 500 emails a day, sent from your own Gmail address.
//   Brevo  BREVO_API_KEY + BREVO_SENDER_EMAIL (+ BREVO_SENDER_NAME). For real use.
// Gmail wins if both are set. With neither, emailConfigured() is false and nothing is sent.

type Email = { subject: string; html: string; text: string };
type Options = { unsubscribeUrl?: string; replyTo?: { email: string; name?: string } };

function gmail() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  return user && pass ? { user, pass } : null;
}

function brevo() {
  const key = process.env.BREVO_API_KEY?.trim();
  const sender = process.env.BREVO_SENDER_EMAIL?.trim();
  return key && sender ? { key, sender } : null;
}

export function emailConfigured() {
  return !!(gmail() || brevo());
}

const senderName = () => process.env.BREVO_SENDER_NAME?.trim() || "GoBid";

export async function sendEmail(to: string, email: Email, opts: Options = {}) {
  const g = gmail();
  if (g) {
    const transport = nodemailer.createTransport({ service: "gmail", auth: { user: g.user, pass: g.pass }, connectionTimeout: 15_000, socketTimeout: 20_000 });
    await transport.sendMail({
      from: { name: senderName(), address: g.user },
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(opts.replyTo ? { replyTo: { name: opts.replyTo.name ?? "", address: opts.replyTo.email } } : {}),
      ...(opts.unsubscribeUrl ? { list: { unsubscribe: opts.unsubscribeUrl } } : {}),
    });
    return;
  }

  const b = brevo();
  if (!b) throw new Error("Email isn't set up.");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "api-key": b.key },
    body: JSON.stringify({
      sender: { email: b.sender, name: senderName() },
      to: [{ email: to }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${opts.unsubscribeUrl}>` } } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo answered ${res.status}: ${detail.slice(0, 200)}`);
  }
}

export function siteUrlFrom(req: Request) {
  return (process.env.SITE_URL?.trim() || new URL(req.url).origin).replace(/\/$/, "");
}
