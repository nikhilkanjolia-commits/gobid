import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { callSupabaseFunction } from "@/lib/supabase";
import type { SearchKeyword } from "@/lib/tenderQuery";

// The keywords the hourly GeM collector searches for (Settings page).
//   GET                      list them (anyone)
//   POST {keyword, category, enabled, pages}   add or change one   ┐ need header
//   DELETE ?keyword=MCB      remove one                            ┘ x-gobid-admin = ADMIN_PASSCODE

function isAdmin(req: Request) {
  const expected = process.env.ADMIN_PASSCODE?.trim();
  const given = req.headers.get("x-gobid-admin") ?? "";
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function denied() {
  return process.env.ADMIN_PASSCODE?.trim()
    ? Response.json({ error: "Wrong admin passcode." }, { status: 401 })
    : Response.json({ error: "Editing keywords isn't set up: add ADMIN_PASSCODE to the environment." }, { status: 503 });
}

async function run<T>(fn: () => Promise<T | null>) {
  try {
    const out = await fn();
    if (out === null) return Response.json({ error: "Supabase isn't set up yet." }, { status: 503 });
    return Response.json(out ?? { ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message.replace(/^Supabase \w+ failed \(\d+\): /, "") }, { status: 502 });
  }
}

export async function GET() {
  return run(() => callSupabaseFunction<SearchKeyword[]>("list_search_keywords", {}));
}

const Body = z.object({
  keyword: z.string().trim().min(2).max(60),
  category: z.string().trim().min(2).max(40),
  enabled: z.boolean().default(true),
  pages: z.number().int().min(1).max(5).default(2),
});

export async function POST(req: Request) {
  if (!isAdmin(req)) return denied();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Keyword (2–60 letters), category (2–40) and pages (1–5) are needed." }, { status: 400 });
  const k = parsed.data;
  return run(async () =>
    (await callSupabaseFunction("save_search_keyword", { p_keyword: k.keyword, p_category: k.category, p_enabled: k.enabled, p_pages: k.pages })) === null
      ? null
      : { ok: true },
  );
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) return denied();
  const keyword = new URL(req.url).searchParams.get("keyword")?.trim();
  if (!keyword) return Response.json({ error: "Which keyword? Add ?keyword=…" }, { status: 400 });
  return run(async () => ((await callSupabaseFunction("delete_search_keyword", { p_keyword: keyword })) === null ? null : { ok: true }));
}
