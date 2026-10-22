import "server-only";

// Sends one email through Brevo's transactional API.
// Env: BREVO_API_KEY, BREVO_SENDER_EMAIL (a sender you verified in Brevo), BREVO_SENDER_NAME.
export function brevoConfigured() {
  return !!(process.env.BREVO_API_KEY?.trim() && process.env.BREVO_SENDER_EMAIL?.trim());
}

export async function sendEmail(to: string, email: { subject: string; html: string; text: string }, unsubscribeUrl: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "api-key": process.env.BREVO_API_KEY!.trim() },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL!.trim(), name: process.env.BREVO_SENDER_NAME?.trim() || "GoBid" },
      to: [{ email: to }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo answered ${res.status}: ${detail.slice(0, 200)}`);
  }
}
