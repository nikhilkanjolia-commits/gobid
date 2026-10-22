import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergePriceLists, parsePriceList, type PriceRow } from "../src/lib/priceList";
import { loadN8nCode } from "./loadN8nCode";

type BoqRow = {
  item: string;
  description: string;
  unit: string | null;
  qty: number | null;
  rate?: number | null;
  amount?: number | null;
  page: number;
  quote: string;
  verified: boolean;
  verifyNote?: string | null;
  qtyMismatch?: number;
};
type Match = { item: string; sku: string | null; confidence: number; reason?: string };
type Flag = { level: "red" | "amber"; text: string };
type Checked = { item: string; status: string; sku: string | null; flags: Flag[]; qty: number | null; listPrice: number | null; discountPct: number | null };
type Priced = Checked & { unitCost: number | null; costAmount: number | null; bidRate: number | null; bidAmount: number | null };
type Totals = { costTotal: number; bidTotal: number; marginPct: number | null; pricedLines: number; totalLines: number; unpricedLines: number; redLines: number; amberLines: number };

const { shortlistSkus } = loadN8nCode<{ shortlistSkus: (rows: BoqRow[], price: PriceRow[], limit?: number) => { item: string; candidates: { sku: string }[] }[] }>(
  "shortlist.js",
  ["shortlistSkus"],
);
type Group = { itemGroup: string; brands: string[] };
const { checkMatches } = loadN8nCode<{ checkMatches: (rows: BoqRow[], m: Match[], price: PriceRow[], groups: Group[]) => Checked[] }>(
  "matchChecks.js",
  ["checkMatches"],
);
const { priceBoq } = loadN8nCode<{ priceBoq: (rows: Checked[], firm: { markupPct: number }) => { rows: Priced[]; totals: Totals } }>(
  "pricing.js",
  ["priceBoq"],
);

const csv = (name: string) => readFileSync(`public/samples/${name}`, "utf8");
const priceRows = mergePriceLists([
  parsePriceList("switchgear-supplier.csv", csv("switchgear-supplier.csv")),
  parsePriceList("cables-supplier.csv", csv("cables-supplier.csv")),
]).rows;

function line(item: string, description: string, qty: number | null, unit: string | null = "Nos", extra: Partial<BoqRow> = {}): BoqRow {
  return { item, description, unit, qty, page: 80, quote: description, verified: true, verifyNote: null, ...extra };
}

describe("sample price lists", () => {
  it("load without errors", () => {
    expect(priceRows.length).toBe(25);
  });
});

describe("shortlistSkus", () => {
  it("puts the right SKU near the top using ratings, and only returns real SKUs", () => {
    const [mcb, cable] = shortlistSkus(
      [
        line("1", "Supply of MCB 63 Amp, 4 pole, C curve, 10 kA breaking capacity", 10),
        line("2", "1.1 kV XLPE armoured aluminium cable 4 core 25 sq.mm", 200, "Mtr"),
      ],
      priceRows,
    );
    expect(mcb.candidates[0].sku).toBe("HV-MCB-C63-4P");
    expect(cable.candidates[0].sku).toBe("PC-AYFY-4C-25");
    const skus = new Set(priceRows.map((p) => p.sku));
    expect([...mcb.candidates, ...cable.candidates].every((c) => skus.has(c.sku))).toBe(true);
    expect(mcb.candidates.length).toBeLessThanOrEqual(15);
  });
});

describe("checkMatches", () => {
  const check = (row: BoqRow, match: Partial<Match> = {}, approved: Group[] = []) =>
    checkMatches([row], [{ item: row.item, sku: null, confidence: 0.95, ...match }], priceRows, approved)[0];
  const texts = (r: Checked) => r.flags.map((f) => f.level + ": " + f.text);

  it("accepts a good match with no flags", () => {
    const r = check(line("1", "MCCB 100A TP 36kA", 2), { sku: "HV-MCCB-100-36" });
    expect(r.status).toBe("ok");
    expect(r.flags).toEqual([]);
  });

  it("flags 25 kA offered against a 36 kA requirement as red", () => {
    const r = check(line("1", "MCCB 100A TP 36kA", 2), { sku: "HV-MCCB-100-25" });
    expect(texts(r)).toContain("red: Breaking capacity too low: tender 36 kA, SKU 25 kA");
  });

  it("flags wrong poles, current rating and cable size as red", () => {
    expect(check(line("1", "MCB 32A DP C-curve", 5), { sku: "HV-MCB-C32-1P" }).flags[0].text).toContain("Poles mismatch");
    expect(check(line("1", "MCB 16A SP", 5), { sku: "HV-MCB-C32-1P" }).flags[0].text).toContain("Current rating mismatch");
    expect(check(line("1", "XLPE armoured aluminium cable 4 core 16 sqmm", 100, "Mtr"), { sku: "PC-AYFY-4C-25" }).flags[0].text).toContain(
      "Cable size mismatch",
    );
  });

  it("flags an unsure match, a non-approved brand and a unit difference as amber", () => {
    const r = check(line("1", "LED panel 36W", 4, "Mtr"), { sku: "HV-LED-PNL-36", confidence: 0.55 }, [{ itemGroup: "LED panel", brands: ["Philips", "Wipro"] }]);
    expect(r.status).toBe("ok");
    expect(r.flags.every((f) => f.level === "amber")).toBe(true);
    expect(r.flags).toHaveLength(3);
  });

  it("checks approved makes only against the item group a line belongs to", () => {
    const groups = [
      { itemGroup: "LT panel", brands: ["L&T"] },
      { itemGroup: "LT Cables and FRLS Wires", brands: ["Polycab", "KEI"] },
      { itemGroup: "MCB / RCCB / Distribution Boards", brands: ["Legrand"] },
    ];
    // An MCB isn't an LT panel or a cable: only the MCB group applies.
    expect(texts(check(line("1", "MCB 16A SP C-curve", 5), { sku: "HV-MCB-C16-1P" }, groups))).toEqual([
      "amber: Havells is not an approved make for MCB / RCCB / Distribution Boards (Legrand)",
    ]);
    // "LED panel light" contains "panel" but not "LT", so the LT panel group doesn't apply.
    expect(check(line("2", "LED panel light 36W 2x2 ft", 5), { sku: "HV-LED-PNL-36" }, groups).flags).toEqual([]);
    // Polycab cable in the cables group is approved.
    expect(check(line("3", "LT XLPE armoured aluminium cable 4 core 25 sq mm", 50, "Mtr"), { sku: "PC-AYFY-4C-25" }, groups).flags).toEqual([]);
  });

  it("flags a quantity the AI read differently from the PDF line", () => {
    const r = check(line("1", "MCB 16A SP", 15, "Nos", { qtyMismatch: 150 } as Partial<BoqRow>), { sku: "HV-MCB-C16-1P" });
    expect(texts(r)).toContain("red: AI read quantity 15, but the PDF line says 150");
  });

  it("treats no SKU, or a SKU that isn't in the price list, as unmatched (not priced)", () => {
    expect(check(line("1", "Street light pole 9 m", 3)).status).toBe("unmatched");
    const invented = check(line("1", "Street light pole 9 m", 3), { sku: "MADE-UP-123" });
    expect(invented.status).toBe("unmatched");
    expect(invented.flags[0].text).toContain("isn't in the price lists");
  });

  it("marks lines with missing qty/unit or an unverified source as unreliable", () => {
    expect(check(line("1", "MCB 16A SP", null), { sku: "HV-MCB-C16-1P" }).status).toBe("unreliable");
    expect(check(line("1", "MCB 16A SP", 5, null), { sku: "HV-MCB-C16-1P" }).status).toBe("unreliable");
    const ghost = check(line("1", "MCB 16A SP", 5, "Nos", { verified: false, verifyNote: "Quote not found on page 80" }), { sku: "HV-MCB-C16-1P" });
    expect(ghost.status).toBe("unreliable");
    expect(ghost.flags[0].level).toBe("red");
  });

  it("flags a printed amount that isn't qty × rate", () => {
    const r = check(line("1", "MCB 16A SP", 10, "Nos", { rate: 150, amount: 1600 }), { sku: "HV-MCB-C16-1P" });
    expect(texts(r)).toContain("red: Printed amount 1600 ≠ qty × rate (1500)");
    const ok = check(line("1", "MCB 16A SP", 10, "Nos", { rate: 150, amount: 1500 }), { sku: "HV-MCB-C16-1P" });
    expect(ok.flags).toEqual([]);
  });
});

describe("priceBoq", () => {
  it("applies discount, quantity and markup exactly", () => {
    // HV-MCB-C16-1P: list ₹240, 38% off → ₹148.80; ×25 = ₹3,720. Markup 15% → bid rate ₹171.12; ×25 = ₹4,278.
    const checked = checkMatches([line("1", "MCB 16A SP C-curve 10kA", 25)], [{ item: "1", sku: "HV-MCB-C16-1P", confidence: 0.9 }], priceRows, []);
    const { rows, totals } = priceBoq(checked, { markupPct: 15 });
    expect(rows[0].unitCost).toBe(148.8);
    expect(rows[0].costAmount).toBe(3720);
    expect(rows[0].bidRate).toBe(171.12);
    expect(rows[0].bidAmount).toBe(4278);
    expect(totals.costTotal).toBe(3720);
    expect(totals.bidTotal).toBe(4278);
    expect(totals.marginPct).toBe(13.04);
  });

  it("adds fractional quantities and many lines without rounding drift", () => {
    // FRLS 1.5 sqmm: ₹22, 45% off → ₹12.10/m. 0.5 m × 3 lines and 1000.25 m.
    const rows = [line("1", "FRLS wire 1.5 sqmm", 0.5, "Mtr"), line("2", "FRLS wire 1.5 sqmm", 0.5, "Mtr"), line("3", "FRLS wire 1.5 sqmm", 0.5, "Mtr"), line("4", "FRLS wire 1.5 sqmm", 1000.25, "Mtr")];
    const matches = rows.map((r) => ({ item: r.item, sku: "PC-FRLS-1.5", confidence: 0.9 }));
    const { totals } = priceBoq(checkMatches(rows, matches, priceRows, []), { markupPct: 0 });
    // 3 × ₹6.05 + ₹12,103.03 (12.10 × 1000.25 = 12103.025 → 12103.03)
    expect(totals.costTotal).toBe(12121.18);
  });

  it("leaves unmatched and unreliable lines out of the totals but keeps them listed", () => {
    const rows = [line("1", "MCB 16A SP", 10), line("2", "Street light pole", 3), line("3", "MCB 16A SP", null)];
    const matches = [{ item: "1", sku: "HV-MCB-C16-1P", confidence: 0.9 }, { item: "3", sku: "HV-MCB-C16-1P", confidence: 0.9 }];
    const { rows: out, totals } = priceBoq(checkMatches(rows, matches as Match[], priceRows, []), { markupPct: 15 });
    expect(out).toHaveLength(3);
    expect(totals.pricedLines).toBe(1);
    expect(totals.unpricedLines).toBe(2);
    expect(totals.costTotal).toBe(1488);
    expect(out[1].costAmount).toBeNull();
    expect(totals.redLines).toBe(1);
    expect(totals.amberLines).toBe(1);
  });
});
