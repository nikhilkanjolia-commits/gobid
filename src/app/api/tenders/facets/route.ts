import { z } from "zod";
import { callSupabaseFunction } from "@/lib/supabase";
import { TABS, type TenderFacets } from "@/lib/tenderQuery";

// GET /api/tenders/facets?q=&tab=live: counts for the status tabs and the filter panel.
const Query = z.object({ q: z.string().trim().max(200).optional(), tab: z.enum(TABS).default("live") });

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid q or tab" }, { status: 400 });
  try {
    const facets = await callSupabaseFunction<TenderFacets>("tender_facets", { q: parsed.data.q || null, tab: parsed.data.tab });
    if (facets === null) return Response.json({ error: "Tender search isn't set up yet." }, { status: 503 });
    return Response.json(facets);
  } catch (e) {
    return Response.json({ error: `Couldn't load filters: ${(e as Error).message}` }, { status: 502 });
  }
}
