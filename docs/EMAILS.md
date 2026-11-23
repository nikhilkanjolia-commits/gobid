# Emails: welcome, daily digest, closing reminders, contact form

| Email | When | Sent by | Once-only check |
|---|---|---|---|
| **Welcome** | First time a user opens Email alerts after signing in | `GET /api/me/alerts` (after the response) | `email_log` (welcome), given back if sending fails |
| **Daily digest** | 8:00 AM IST | n8n "GoBid daily digest" → `POST /api/digest/send` | not twice within 20 h |
| **Closing-soon reminder** | In the daily digest, when a tender in the user's categories closes within 3 days | same as the digest | `email_log` (closing_soon, bid number): each tender once |
| **Contact auto-reply** | Someone sends the form at `/contact` | `POST /api/contact` | message saved in `contact_messages` first |
| **Contact notification** | Same moment, to you | `POST /api/contact` | reply-to is the sender, so you just hit Reply |

Email goes out through **Gmail** (for testing) or **Brevo** (for real use), whichever is set up; Gmail wins if both are (`src/lib/mailer.ts`). Everything is recorded in **Supabase** (`supabase/004_emails_contact.sql`). If neither is set up, nothing is sent and nothing pretends it was: the contact form still saves the message.

## Quick test with Gmail (about 500 emails a day)
1. Turn on 2-Step Verification on the Google account, then create an app password at https://myaccount.google.com/apppasswords (a 16-letter code; it is not your normal password).
2. In `.env.local` (and in Vercel for the live site): `GMAIL_USER` = that same Gmail address, `GMAIL_APP_PASSWORD` = the 16 letters, `CONTACT_NOTIFY_EMAIL` = your inbox.
3. The app password must belong to the account in `GMAIL_USER`, or Google answers "Username and Password not accepted".
4. When the test is over, delete the app password on the same Google page.

## Switch it on

1. **Supabase:** SQL Editor → New query → paste all of `supabase/004_emails_contact.sql` → Run.
2. **Brevo** (free plan, about 300 emails a day):
   1. Sign up at https://www.brevo.com.
   2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: the address emails come from (e.g. your Gmail). Verify it from the email Brevo sends.
   3. **SMTP & API → API Keys → Generate a new API key.** Copy it (it's shown once).
3. **Settings**, in `.env.local` and in Vercel (Project → Settings → Environment Variables), then redeploy:
   - `BREVO_API_KEY` = the key
   - `BREVO_SENDER_EMAIL` = the verified sender
   - `BREVO_SENDER_NAME` = `GoBid`
   - `CONTACT_NOTIFY_EMAIL` = your own inbox for contact messages
   - `SITE_URL` = `https://gobid-lake.vercel.app`
4. **Daily digest:** in n8n, import `n8n/gobid-daily-digest.json`, set its URL to your site, pick the existing "Header Auth account" credential, and **Publish**.

## Try it
- **Contact:** open `/contact`, send a message to yourself. You get the auto-reply; `CONTACT_NOTIFY_EMAIL` gets the notification.
- **Welcome:** sign in with a new email and open Email alerts.
- **Digest without sending:** `POST /api/digest/send?dry=1` with the `x-gobid-secret` header shows who would get what.

## Limits
- Brevo free plan: about 300 emails a day.
- The contact form allows 3 messages per sender (email or IP) per hour; a hidden field catches simple bots.
- Supabase's own sign-in emails (the login code) still use Supabase's built-in mailer until you add Brevo's SMTP under Authentication → SMTP Settings.
