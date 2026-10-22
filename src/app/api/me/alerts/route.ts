import { z } from "zod";
import { getAuthUser } from "@/lib/authUser";
import { callSupabaseFunction } from "@/lib/supabase";

// The signed-in user's daily email alert (header Authorization: Bearer <Supabase token>).
//   GET  their choices (or defaults if they haven't saved yet)
//   PUT  {categories, keywords, enabled}  save them
type Alerts = { email: string; categories: string[]; keywords: string[]; enabled: boolean; last_sent_at: string | null };

const notSignedIn = () => Response.json({ error: "Please sign in." }, { status: 401 });

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return notSignedIn();
  try {
    const rows = await callSupabaseFunction<Alerts[]>("get_user_alerts", { p_user_id: user.id });
    if (rows === null) return Response.json({ error: "Supabase isn't set up yet." }, { status: 503 });
    return Response.json(rows[0] ?? { email: user.email, categories: [], keywords: [], enabled: true, last_sent_at: null, saved: false });
  } catch (e) {
    return Response.json({ error: `Couldn't load your alerts: ${(e as Error).message}` }, { status: 502 });
  }
}

const Body = z.object({
  categories: z.array(z.string().trim().min(1).max(40)).max(20),
  keywords: z.array(z.string().trim().min(1).max(60)).max(40),
  enabled: z.boolean(),
});

export async function PUT(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return notSignedIn();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose up to 20 categories and 40 keywords." }, { status: 400 });
  const a = parsed.data;
  try {
    await callSupabaseFunction("save_user_alerts", {
      p_user_id: user.id,
      p_email: user.email,
      p_categories: a.categories,
      p_keywords: a.keywords,
      p_enabled: a.enabled,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: `Couldn't save: ${(e as Error).message}` }, { status: 502 });
  }
}
