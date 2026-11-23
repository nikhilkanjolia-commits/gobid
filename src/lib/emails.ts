// The one-off emails GoBid sends: welcome, the contact-form auto-reply, and the notification to
// the GoBid team. Pure functions (no sending), unit-tested in tests/emails.test.ts. The daily
// digest is built in src/lib/digest.ts.

export type Email = { subject: string; html: string; text: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;background:#ffffff">
<div style="font:700 22px Arial,sans-serif;color:#172554">Go<span style="color:#2563eb">Bid</span></div>
${body}
<p style="font:12px Arial,sans-serif;color:#94a3b8;margin-top:28px">GoBid · Tender analysis for electrical and solar contractors</p>
</div></body></html>`;
}

const p = (s: string) => `<p style="font:15px/1.5 Arial,sans-serif;color:#334155;margin:14px 0">${s}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#2563eb;color:#ffffff;font:600 15px Arial,sans-serif;padding:11px 18px;border-radius:8px;text-decoration:none">${esc(label)}</a></p>`;

export function buildWelcomeEmail(opts: { siteUrl: string }): Email {
  const s = opts.siteUrl;
  return {
    subject: "Welcome to GoBid",
    html: layout(
      [
        p("Hi,"),
        p("Thanks for signing up to GoBid. Here’s how to get the most out of it:"),
        `<ol style="font:15px/1.6 Arial,sans-serif;color:#334155;padding-left:20px">
<li><b>Pick your categories</b> on Email alerts. You’ll get new GeM tenders for them every morning at 8 AM, and a reminder when one is about to close.</li>
<li><b>Analyse a tender</b>: upload the PDF and your price list to see if you qualify, which documents are missing, and a priced BOQ.</li>
<li><b>Open any tender</b> on GeM tenders to download its bid document, specs, BOQ and ATC.</li>
</ol>`,
        button(`${s}/alerts`, "Choose my categories"),
        p(`Questions or feedback? Just reply to this email or use <a href="${esc(s)}/contact" style="color:#2563eb">the contact form</a>.`),
      ].join(""),
    ),
    text: [
      "Hi,",
      "",
      "Thanks for signing up to GoBid. Here's how to get the most out of it:",
      "1. Pick your categories on Email alerts: new GeM tenders every morning at 8 AM, and a reminder when one is about to close.",
      "2. Analyse a tender: upload the PDF and your price list to see if you qualify, which documents are missing, and a priced BOQ.",
      "3. Open any tender on GeM tenders to download its bid document, specs, BOQ and ATC.",
      "",
      `Choose your categories: ${s}/alerts`,
      `Questions? Reply to this email or use ${s}/contact`,
    ].join("\n"),
  };
}

export type ContactMessage = { id: number; name: string; email: string; company: string | null; message: string };

export function buildContactAutoReply(m: ContactMessage, opts: { siteUrl: string }): Email {
  const first = m.name.trim().split(/\s+/)[0] || "there";
  const quoted = esc(m.message).replace(/\n/g, "<br>");
  return {
    subject: "We got your message – GoBid",
    html: layout(
      [
        p(`Hi ${esc(first)},`),
        p("Thanks for writing to GoBid. Your message has reached us and we’ll reply soon. You don’t need to send it again."),
        `<blockquote style="margin:16px 0;padding:10px 14px;border-left:3px solid #93b4ff;background:#f5f8ff;font:14px/1.5 Arial,sans-serif;color:#475569">${quoted}</blockquote>`,
        p(`Meanwhile, you can <a href="${esc(opts.siteUrl)}/analyze?demo=1" style="color:#2563eb">see a sample tender report</a> or <a href="${esc(opts.siteUrl)}/tenders" style="color:#2563eb">browse live GeM tenders</a>.`),
        p(`Reference: #${m.id}`),
      ].join(""),
    ),
    text: [
      `Hi ${first},`,
      "",
      "Thanks for writing to GoBid. Your message has reached us and we'll reply soon. You don't need to send it again.",
      "",
      "Your message:",
      m.message.split("\n").map((l) => `> ${l}`).join("\n"),
      "",
      `Sample tender report: ${opts.siteUrl}/analyze?demo=1`,
      `Reference: #${m.id}`,
    ].join("\n"),
  };
}

export function buildContactNotification(m: ContactMessage): Email {
  return {
    subject: `New GoBid contact #${m.id}: ${m.name.slice(0, 60)}`,
    html: layout(
      [
        p(`<b>${esc(m.name)}</b> &lt;${esc(m.email)}&gt;${m.company ? ` · ${esc(m.company)}` : ""}`),
        `<div style="padding:12px 14px;background:#f5f8ff;border-radius:8px;font:14px/1.5 Arial,sans-serif;color:#334155">${esc(m.message).replace(/\n/g, "<br>")}</div>`,
        p("Reply to this email to answer them directly."),
      ].join(""),
    ),
    text: `${m.name} <${m.email}>${m.company ? ` · ${m.company}` : ""}\n\n${m.message}\n\nReply to this email to answer them directly.`,
  };
}
