import { readBidFiles } from "@/lib/gemDocuments";
import { BID_NUMBER, isReadableBidDocument } from "@/lib/gemFiles";
import { callSupabaseFunction } from "@/lib/supabase";
import { toSearchArgs, TenderQuery, type Tender } from "@/lib/tenderQuery";

// GET /api/tenders/documents?bid=GEM/2026/B/1234567
// The files linked from that bid's GeM document (specification, BOQ, ATC, terms). The bid must
// be one the collector saved; its document link comes from the database, never the request.
export const maxDuration = 60;

export async function GET(req: Request) {
  const bid = new URL(req.url).searchParams.get("bid")?.trim().toUpperCase() ?? "";
  if (!BID_NUMBER.test(bid)) return Response.json({ error: "Give a GeM bid number like GEM/2026/B/1234567." }, { status: 400 });

  let tender: Tender | undefined;
  try {
    const rows = await callSupabaseFunction<Tender[]>("search_tenders", toSearchArgs(TenderQuery.parse({ q: bid, tab: "all", page_size: 10 })));
    if (rows === null) return Response.json({ error: "Tender search isn't set up yet (Supabase settings missing)." }, { status: 503 });
    tender = rows.find((r) => r.bid_number === bid);
  } catch (e) {
    return Response.json({ error: `Tender lookup failed: ${(e as Error).message}` }, { status: 502 });
  }
  if (!tender) return Response.json({ error: "GoBid hasn't collected this bid." }, { status: 404 });

  if (!isReadableBidDocument(tender.document_url)) {
    // Some reverse auctions only have a schedule page on GeM, not a PDF.
    return Response.json({ bid, documentUrl: tender.document_url, pageCount: null, files: [], note: "GeM has no bid PDF for this one; open it on GeM." });
  }
  try {
    return Response.json({ bid, ...(await readBidFiles(tender.document_url!)) });
  } catch (e) {
    return Response.json({ error: `Couldn't read the bid document from GeM: ${(e as Error).message}`, documentUrl: tender.document_url }, { status: 502 });
  }
}
