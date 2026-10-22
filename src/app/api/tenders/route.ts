import { z } from "zod";
import { callSupabaseFunction } from "@/lib/supabase";

// GET /api/tenders: search the GeM bids the n8n collector saved.
//   q          words to find in items, ministry, department or bid number
//   ministry   part of the ministry name
//   status     "open" (default: closing date still ahead) or "all"
//   closing_from, closing_to   date range for the closing date (YYYY-MM-DD)
//   sort       publish_date_desc (default), closing_date_asc, closing_date_desc
//   page, page_size (max 100)
const Query = z.object({
  q: z.string().trim().max(200).optional(),
  ministry: z.string().trim().max(200).optional(),
  status: z.enum(["open", "all"]).default("open"),
  closing_from: z.iso.date().optional(),
  closing_to: z.iso.date().optional(),
  sort: z.enum(["publish_date_desc", "closing_date_asc", "closing_date_desc"]).default("publish_date_desc"),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

type Row = {
  bid_number: string;
  bid_kind: string | null;
  items: string;
  quantity: number | null;
  ministry: string | null;
  department: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_high_value: boolean;
  has_boq: boolean;
  document_url: string | null;
  matched_keywords: string[];
  first_seen_at: string;
  total_count: number;
};

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = Query.safeParse(params);
  if (!parsed.success) {
    const problem = parsed.error.issues[0];
    return Response.json({ error: `Invalid "${problem.path.join(".")}": ${problem.message}` }, { status: 400 });
  }
  const p = parsed.data;

  let rows: Row[] | null;
  try {
    rows = await callSupabaseFunction<Row[]>("search_tenders", {
      q: p.q || null,
      p_ministry: p.ministry || null,
      open_only: p.status === "open",
      // Dates are India dates: the whole closing day counts.
      closing_from: p.closing_from ? `${p.closing_from}T00:00:00+05:30` : null,
      closing_to: p.closing_to ? `${p.closing_to}T23:59:59+05:30` : null,
      sort: p.sort,
      page_size: p.page_size,
      page_offset: (p.page - 1) * p.page_size,
    });
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
