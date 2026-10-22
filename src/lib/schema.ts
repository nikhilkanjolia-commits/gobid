import { z } from "zod";

// What the browser sends to /api/analyze.
export const AnalyzeRequest = z.union([
  z.object({ demo: z.literal(true) }),
  z.object({
    pages: z.array(z.object({ page: z.number().int().positive(), text: z.string() })).min(1),
    priceRows: z
      .array(
        z.object({
          sku: z.string().min(1),
          description: z.string().min(1),
          brand: z.string().min(1),
          unit: z.string().min(1),
          listPrice: z.number().positive(),
          discountPct: z.number().min(0).max(99),
          ratingKA: z.number().nullable(),
          poles: z.number().nullable(),
          source: z.string(),
        }),
      )
      .min(1),
  }),
]);
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

const Flag = z.object({ level: z.enum(["red", "amber"]), text: z.string() });

const EligibilityRow = z.object({
  type: z.string(),
  label: z.string(),
  requirement: z.string().nullable(),
  firmHas: z.string().nullable(),
  result: z.enum(["pass", "fail", "unknown", "info"]),
  reason: z.string(),
  page: z.number().nullable(),
  quote: z.string().nullable(),
});

const BoqRow = z.object({
  item: z.string(),
  description: z.string(),
  unit: z.string().nullable(),
  qty: z.number().nullable(),
  page: z.number().nullable(),
  status: z.enum(["ok", "unreliable", "unmatched"]),
  sku: z.string().nullable(),
  skuDescription: z.string().nullable(),
  brand: z.string().nullable(),
  listPrice: z.number().nullable(),
  discountPct: z.number().nullable(),
  confidence: z.number().nullable(),
  unitCost: z.number().nullable(),
  costAmount: z.number().nullable(),
  bidRate: z.number().nullable(),
  bidAmount: z.number().nullable(),
  flags: z.array(Flag),
});

// What the analysis returns (from n8n, direct mode, or the demo). A reply that doesn't fit
// this shape is rejected, so the screen never shows a half-made verdict.
export const AnalyzeResult = z.object({
  verdict: z.object({
    decision: z.enum(["GO", "NO-GO", "REVIEW NEEDED"]),
    reason: z.string(),
    blockers: z.array(z.string()),
    counts: z.record(z.string(), z.number()),
  }),
  eligibility: z.array(EligibilityRow),
  boq: z.object({
    rows: z.array(BoqRow),
    totals: z.object({
      costTotal: z.number(),
      bidTotal: z.number(),
      marginPct: z.number().nullable(),
      pricedLines: z.number(),
      totalLines: z.number(),
      unpricedLines: z.number(),
      redLines: z.number(),
      amberLines: z.number(),
    }),
  }),
  meta: z.object({
    pageCount: z.number(),
    firmName: z.string().nullable(),
    mode: z.enum(["n8n", "direct", "demo"]).optional(),
    seconds: z.number().optional(),
  }),
});
export type AnalyzeResult = z.infer<typeof AnalyzeResult>;
export type EligibilityRow = z.infer<typeof EligibilityRow>;
export type BoqLine = z.infer<typeof BoqRow>;
