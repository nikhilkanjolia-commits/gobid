import { callSupabaseFunction } from "@/lib/supabase";
import { TenderQuery, toSearchArgs, type Tender } from "@/lib/tenderQuery";

// GET /api/tenders: search the GeM bids the collector saved. Parameters: see src/lib/tenderQuery.ts
// (q, tab, category, keyword, ministry, kind, high_value, closing_from, closing_to, sort, page, page_size).
type Row = Tender & { total_count: number };

export async function GET(req: Request) {
  const parsed = TenderQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    const problem = parsed.error.issues[0];
    return Response.json({ error: `Invalid "${problem.path.join(".")}": ${problem.message}` }, { status: 400 });
  }
  const p = parsed.data;

  let rows: Row[] | null;
  try {
    rows = await callSupabaseFunction<Row[]>("search_tenders", toSearchArgs(p));
  } catch (e) {
    return Response.json({ error: `Tender search failed: ${(e as Error).message}` }, { status: 502 });
  }
  if (rows === null) {
    return Response.json(
      { error: "Tender search isn't set up yet: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local and restart." },
      { status: 503 },
    );
  }

  return Response.json({
    total: rows[0]?.total_count ?? 0,
    page: p.page,
    page_size: p.page_size,
    results: rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "total_count"))),
  });
}
