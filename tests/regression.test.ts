import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import firm from "../data/firm-profile.json";
import { mergePriceLists, parsePriceList } from "../src/lib/priceList";

// Replays the two failures from docs/TEST-REPORT.md on the real test PDFs, with AI answers
// shaped like the ones that broke: Tender A's BOQ with every quantity missing, Tender B's
// experience clause with the 7-year look-back put in `years`.
type Page = { page: number; text: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const FILES = ["verifyQuotes.js", "rules.js", "shortlist.js", "matchChecks.js", "pricing.js", "verdict.js", "requests.js", "finalize.js"];
const L = new Function(
  `${FILES.map((f) => readFileSync(path.join("n8n/code", f), "utf8")).join("\n\n")}\nreturn { finalizeResult, toClauses, uniqueItems };`,
)() as Record<string, (...a: Any[]) => Any>;

const priceRows = mergePriceLists(
  ["switchgear-supplier.csv", "cables-supplier.csv"].map((f) => parsePriceList(f, readFileSync(`public/samples/${f}`, "utf8"))),
).rows;

// Same extraction as src/lib/pdfText.ts, using pdf.js's Node build.
async function readPdf(file: string): Promise<Page[]> {
  const pdfjs = await import(pathToFileURL(path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`public/test-tenders/${file}`)) }).promise;
  const pages: Page[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let text = "";
    for (const item of content.items as Any[]) if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
    pages.push({ page: n, text: text.replace(/[ \t]+/g, " ").trim() });
  }
  return pages;
}

const SKU_A = [
  "HV-MCB-C06-1P", "HV-MCB-C16-1P", "HV-MCB-C32-1P", "HV-MCB-C32-2P", "HV-MCB-C63-4P", "HV-RCCB-40-2P", "HV-RCCB-63-4P",
  "HV-DB-8W-TPN", "HV-DB-12W-SPN", "HV-MCCB-100-36", "HV-MCCB-250-36", "HV-MCCB-100-36", "HV-LED-PNL-36", "HV-LED-BAT-20",
  "PC-AYFY-4C-16", "PC-AYFY-4C-25", "PC-AYFY-3.5C-95", "PC-AYFY-3.5C-185", "PC-FRLS-1.5", "PC-FRLS-2.5", "PC-FRLS-4",
  "PC-FRLS-6", "PC-PVC-CONDUIT-25", "PC-GI-EARTH-STRIP", null, null, null, "PC-CU-ARM-4C-6",
];

describe("Tender A (150 pages): BOQ quantities missing from the AI answer", () => {
  let result: Any;
  beforeAll(async () => {
    const pages = await readPdf("tender-A-gem-hospital-150p.pdf");
    // Rebuild the AI's BOQ rows from the printed lines, but with qty and unit left null.
    const rows: Any[] = [];
    for (const p of pages.filter((x) => x.page >= 140 && x.page <= 145)) {
      // Long lines wrap in the PDF, so read the page as one string.
      for (const m of p.text.replace(/\s+/g, " ").matchAll(/(\d+) \| (Supply, installation, testing and commissioning of .+?) \|/g)) {
        rows.push({ item: m[1], description: m[2], unit: null, qty: null, rate: null, amount: null, page: p.page, quote: m[2] });
      }
    }
    const matches = rows.map((r, i) => ({ item: r.item, sku: SKU_A[i], confidence: 0.95, reason: "" }));
    result = L.finalizeResult({ pages, clauses: [], boqRows: L.uniqueItems(rows), matches, priceRows, firm, today: "2026-10-22" });
  }, 60_000);

  it("reads all 28 quantities from the PDF and prices the 25 matched lines", () => {
    expect(result.boq.rows).toHaveLength(28);
    expect(result.boq.rows.every((r: Any) => r.qty != null && r.unit)).toBe(true);
    expect(result.boq.totals.pricedLines).toBe(25);
  });

  it("matches the hand-calculated cost total in expected.json", () => {
    const expected = JSON.parse(readFileSync("public/test-tenders/expected.json", "utf8"))["tender-A-gem-hospital-150p.pdf"];
    expect(result.boq.totals.costTotal).toBe(expected.boq.expected_cost_total_inr_for_25_matched_lines);
  });

  it("still flags the 50 kA MCCB priced at a 36 kA SKU as red", () => {
    const line12 = result.boq.rows.find((r: Any) => r.item === "12");
    expect(line12.flags.map((f: Any) => f.text)).toContain("Breaking capacity too low: tender 50 kA, SKU 36 kA");
  });
});

describe("Tender B (64 pages): look-back years and MSE/approved-make reading", () => {
  let result: Any;
  beforeAll(async () => {
    const pages = await readPdf("tender-B-cpwd-polytechnic-64p.pdf");
    const quote = (page: number, start: string, end: string) => {
      const text = pages[page - 1].text.replace(/\s+/g, " ");
      return text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)) + end.length);
    };
    const blank = {
      makes: [], emdRequired: null, emdAmountInr: null, minAvgAnnualTurnoverInr: null, notRequired: null, experienceYears: null,
      lookbackYears: null, orderOptions: [], oemRequired: null, certificateName: null, mseExemptExperienceTurnover: null,
      mseExemptEmd: null, itemGroups: [],
    };
    // Flat answers, as the new A2 format returns them; experience repeats Tender B's mistake (years: 7).
    const answer = {
      clauses: [
        { ...blank, type: "experience", requirement: "Similar works in last 7 years", page: 2, experienceYears: 7,
          orderOptions: [{ count: 3, eachAtLeastInr: 2000000 }, { count: 2, eachAtLeastInr: 3000000 }, { count: 1, eachAtLeastInr: 4000000 }],
          quote: quote(2, "The bidder should have satisfactorily completed", "not less than Rs. 40.00 Lakh.") },
        { ...blank, type: "turnover", requirement: "Turnover ₹1.2 crore", page: 2, minAvgAnnualTurnoverInr: 12000000,
          quote: quote(2, "Average annual financial turnover", "at least Rs. 1.20 Crore.") },
        { ...blank, type: "certificate", requirement: "ISO 14001", page: 2, certificateName: "ISO 14001",
          quote: quote(2, "The bidder must hold a valid ISO 14001", "on the date of submission of bid.") },
        { ...blank, type: "emd", requirement: "EMD ₹62,800", page: 3, emdRequired: true, emdAmountInr: 62800,
          quote: quote(3, "Earnest Money: Rs. 62,800", "e-procurement portal.") },
        { ...blank, type: "oem_authorization", requirement: "L&T authorisation", page: 24, oemRequired: true, makes: ["L&T"],
          quote: quote(24, "the bidder shall submit authorisation from L&T", "for the panel and MCCBs.") },
        { ...blank, type: "approved_makes", requirement: "Cables Polycab or KEI", page: 24,
          itemGroups: [{ itemGroup: "Cables", brands: ["Polycab", "KEI"] }],
          quote: quote(24, "All cables shall be of Polycab or KEI make only.", "only.") },
      ],
    };
    const rows = [
      { item: "1", description: "Providing and fixing MCB 16A SP C-curve 10kA", unit: null, qty: null, rate: 165, amount: 14850, page: 55, quote: "Providing and fixing MCB 16A SP C-curve 10kA" },
      { item: "8", description: "Providing and fixing LT XLPE armoured aluminium cable 3.5 core 95 sq mm 1.1 kV", unit: "Mtr", qty: 140, rate: 520, amount: 72800, page: 55, quote: "Providing and fixing LT XLPE armoured aluminium cable 3.5 core 95 sq mm" },
    ];
    const matches = [{ item: "1", sku: "HV-MCB-C16-1P", confidence: 0.95 }, { item: "8", sku: "PC-AYFY-3.5C-95", confidence: 0.95 }];
    result = L.finalizeResult({ pages, clauses: L.toClauses(answer), boqRows: rows, matches, priceRows, firm, today: "2026-10-22" });
  }, 60_000);

  it("passes experience (one ₹42 lakh work) instead of failing on the 7-year look-back", () => {
    const exp = result.eligibility.find((r: Any) => r.type === "experience");
    expect(exp.result).toBe("pass");
    expect(result.verdict.reason).not.toContain("needs 7 years");
  });

  it("keeps the real blockers: ISO 14001 expired and L&T authorisation", () => {
    expect(result.verdict.decision).toBe("NO-GO");
    expect(result.verdict.reason).toContain("ISO 14001 expired on 2026-05-31 (p. 2)");
    expect(result.verdict.reason).toContain("Needs authorization from L&T");
  });

  it("reads the EMD amount from the flat answer", () => {
    expect(result.eligibility.find((r: Any) => r.type === "emd").reason).toBe("Arrange EMD of ₹62,800");
  });

  it("does not flag Havells MCBs against the cables-only approved-makes list", () => {
    const mcb = result.boq.rows.find((r: Any) => r.item === "1");
    expect(mcb.qty).toBe(90);
    expect(mcb.flags).toEqual([]);
  });
});
