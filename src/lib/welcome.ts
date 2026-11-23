import "server-only";
import type { AuthUser } from "@/lib/authUser";
import { emailConfigured, sendEmail } from "@/lib/mailer";
import { buildWelcomeEmail } from "@/lib/emails";
import { callSupabaseFunction } from "@/lib/supabase";

// Sends the welcome email once per user. The claim in Supabase (email_log) makes it once-only,
// even if the user opens several tabs; a failed send gives the claim back so it's retried on
// their next visit. Never throws: a welcome email must not break the page it rides on.
export async function sendWelcomeOnce(user: AuthUser, siteUrl: string): Promise<"sent" | "already" | "not_configured" | "failed"> {
  if (!emailConfigured()) return "not_configured";
  try {
    const claimed = await callSupabaseFunction<boolean>("claim_email", { p_user_id: user.id, p_kind: "welcome", p_ref: "" });
    if (!claimed) return "already";
    try {
      await sendEmail(user.email, buildWelcomeEmail({ siteUrl }));
      return "sent";
    } catch (e) {
      await callSupabaseFunction("release_email", { p_user_id: user.id, p_kind: "welcome", p_ref: "" }).catch(() => null);
      console.error("welcome email failed:", (e as Error).message.slice(0, 200));
      return "failed";
    }
  } catch (e) {
    console.error("welcome email claim failed:", (e as Error).message.slice(0, 200));
    return "failed";
  }
}
