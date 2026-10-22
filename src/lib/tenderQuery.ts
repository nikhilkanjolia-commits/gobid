import { z } from "zod";

// The tender search parameters, shared by GET /api/tenders and the tenders page.
//   q            words to find in items, ministry, department or bid number
//   tab          live (default) | closing_soon (≤ 3 days) | new (seen in last 24 h) | closed | all
//   category     one or more categories, comma-separated ("Switchgear,Lighting")
//   keyword      one or more collector keywords, comma-separated ("MCCB,solar")
//   ministry     part of the ministry name
//   kind         BID or RA (reverse auction)
//   high_value   true: only GeM high-value bids
//   closing_from, closing_to   closing-date range (YYYY-MM-DD, India dates)
//   sort         publish_date_desc (default) | closing_date_asc | closing_date_desc | first_seen_desc
//   page, page_size (max 100)
const list = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []));

export const TABS = ["live", "closing_soon", "new", "closed", "all"] as const;
export const SORTS = ["publish_date_desc", "closing_date_asc", "closing_date_desc", "first_seen_desc"] as const;

export const TenderQuery = z.object({
  q: z.string().trim().max(200).optional(),
  tab: z.enum(TABS).default("live"),
  category: list,
  keyword: list,
  ministry: z.string().trim().max(200).optional(),
  kind: z.enum(["BID", "RA"]).optional(),
  high_value: z.enum(["true", "false"]).optional(),
  closing_from: z.iso.date().optional(),
  closing_to: z.iso.date().optional(),
  sort: z.enum(SORTS).default("publish_date_desc"),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type TenderQuery = z.infer<typeof TenderQuery>;

// One search result.
export type Tender = {
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
  categories: string[];
  first_seen_at: string;
};

// A keyword the hourly collector searches GeM for (search_keywords table).
export type SearchKeyword = { keyword: string; category: string; enabled: boolean; pages: number };

export type TenderPage ={ total: number; page: number; page_size: number; results: Tender[] };

// Counts for the tabs and filter panel (GET /api/tenders/facets).
export type TenderFacets = {
  tabs: Record<(typeof TABS)[number], number>;
  categories: { category: string; count: number }[];
  keywords: { keyword: string; category: string; count: number }[];
  ministries: { ministry: string; count: number }[];
  kinds: { BID: number; RA: number };
  high_value: number;
  last_run: { ran_at: string; bids_received: number; bids_new: number } | null;
};

// Arguments for the search_tenders() function in Supabase.
export function toSearchArgs(p: TenderQuery) {
  return {
    q: p.q || null,
    p_ministry: p.ministry || null,
    tab: p.tab,
    p_categories: p.category.length ? p.category : null,
    p_keywords: p.keyword.length ? p.keyword : null,
    p_kind: p.kind ?? null,
    high_value_only: p.high_value === "true",
    // India dates: the whole closing day counts.
    closing_from: p.closing_from ? `${p.closing_from}T00:00:00+05:30` : null,
    closing_to: p.closing_to ? `${p.closing_to}T23:59:59+05:30` : null,
    sort: p.sort,
    page_size: p.page_size,
    page_offset: (p.page - 1) * p.page_size,
  };
}
