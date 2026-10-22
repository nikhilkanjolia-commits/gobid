import { timingSafeEqual } from "node:crypto";
import { collectGemBids, probeGem, type SaveResult } from "@/lib/gemCollector";
import { callSupabaseFunction } from "@/lib/supabase";

// POST /api/gem/collect: runs one GeM collection and saves it to Supabase. Called every hour
// by the n8n "GoBid GeM collector" workflow. Runs in Vercel's Mumbai region (vercel.json),
// because GeM refuses connections from servers outside India.
//   header x-gobid-secret: must equal GEM_COLLECT_SECRET
//   ?probe=1  only check that GeM answers from here (one request, saves nothing)
// 37 requests, 2 s apart: about 80 s.
export const maxDuration = 300;

function secretMatches(given: string | null) {
  const expected = process.env.GEM_COLLECT_SECRET?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!process.env.GEM_COLLECT_SECRET?.trim()) {
    return Response.json({ error: "Collector isn't set up: add GEM_COLLECT_SECRET to the environment." }, { status: 503 });
  }
  if (!secretMatches(req.headers.get("x-gobid-secret"))) {
    return Response.json({ error: "Wrong or missing x-gobid-secret header." }, { status: 401 });
  }
  const region = process.env.VERCEL_REGION ?? "local";

  try {
    if (new URL(req.url).searchParams.get("probe") === "1") {
      return Response.json({ region, gem: await probeGem() });
    }
    const result = await collectGemBids({
      save: async (rows, requests) => {
        const saved = await callSupabaseFunction<SaveResult>("upsert_gem_tenders", { rows, requests });
        if (!saved) throw new Error("Supabase isn't set up: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
        return saved;
      },
    });
    return Response.json({ region, ...result });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const why = err.cause?.code ? `${err.message} (${err.cause.code})` : err.message;
    return Response.json({ region, error: `GeM collection failed: ${why}` }, { status: 502 });
  }
}
