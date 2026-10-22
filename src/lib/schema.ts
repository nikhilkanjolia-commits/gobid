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
    // Optional supporting documents (MAF, certificates, POs), read to text in the browser.
    // Unreadable ones (scans) are sent as names only, so the report can say so.
    supportingDocs: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          pages: z.array(z.object({ page: z.number().int().positive(), text: z.string().max(20000) })).max(30),
          unreadable: z.boolean(),
          error: z.string().max(300).nullable(),
        }),
      )
      .max(8)
      .default([]),
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

const DocumentRow = z.object({
  docType: z.string(),
  name: z.string(),
  requirement: z.enum(["required", "conditional", "not established"]),
  condition: z.string().nullable(),
  page: z.number().nullable(),
  quote: z.string().nullable(),
  status: z.enum(["Verified", "Missing", "Needs review", "Expired", "Not applicable"]),
  reason: z.string(),
  action: z.string().nullable(),
  evidence: z.string().nullable(),
});

const OemCheck = z.object({
  status: z.enum(["not_required", "missing", "verified", "needs_review", "conflict"]),
  reason: z.string(),
  requirement: z.string(),
  condition: z.string().nullable(),
  tenderMakes: z.array(z.string()),
  page: z.number().nullable(),
  quote: z.string().nullable(),
  letterFile: z.string().nullable(),
  fields: z.array(
    z.object({
      field: z.string(),
      tender: z.string().nullable(),
      letter: z.string().nullable(),
      result: z.enum(["match", "conflict", "missing", "review", "info"]),
      note: z.string().nullable(),
    }),
  ),
});

const ComplianceRow = z.object({
  item: z.string(),
  description: z.string(),
  page: z.number().nullable(),
  sku: z.string().nullable(),
  skuDescription: z.string().nullable(),
  source: z.string().nullable(),
  confidence: z.number().nullable(),
  status: z.enum(["Compliant", "Not compliant", "Needs review"]),
  reason: z.string(),
  params: z.array(
    z.object({
      parameter: z.string(),
      required: z.string(),
      product: z.string().nullable(),
      result: z.enum(["match", "mismatch", "unknown"]),
      note: z.string().nullable(),
    }),
  ),
});

const Readiness = z.object({
  summary: z.object({
    status: z.enum(["Ready for human review", "Review required", "Potential disqualification"]),
    counts: z.object({ passed: z.number(), failed: z.number(), review: z.number() }),
    criticalDocuments: z.array(z.string()),
    technicalMismatches: z.array(z.string()),
    unverifiedClauses: z.array(z.string()),
    actions: z.array(z.object({ priority: z.number(), area: z.string(), text: z.string(), page: z.number().nullable(), quote: z.string().nullable() })),
    boqTotal: z.number().nullable(),
    marginPct: z.number().nullable(),
  }),
  documents: z.array(DocumentRow),
  oem: OemCheck,
  compliance: z.array(ComplianceRow),
  supportingDocs: z.array(
    z.object({
      fileName: z.string(),
      readable: z.boolean(),
      docType: z.string().nullable(),
      title: z.string().nullable(),
      problem: z.string().nullable(),
      fields: z.record(z.string(), z.unknown()),
      unverifiedFields: z.array(z.string()),
    }),
  ),
  tenderReference: z.string().nullable(),
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
  readiness: Readiness,
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
export type ReadinessResult = z.infer<typeof Readiness>;
export type DocumentRowT = z.infer<typeof DocumentRow>;
export type ComplianceRowT = z.infer<typeof ComplianceRow>;
