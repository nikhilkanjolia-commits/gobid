import { describe, expect, it } from "vitest";
import { loadN8nCode } from "./loadN8nCode";

type Item = { page: number | null; quote: string | null };
type Checked = Item & { verified: boolean; verifyNote: string | null };
type Row = { page: number; quote: string; description?: string; verified: boolean; qty: number | null; unit: string | null; qtyMismatch?: number };
const { verifyQuotes, readBoqLines } = loadN8nCode<{
  verifyQuotes: (pages: unknown[], items: Item[]) => Checked[];
  readBoqLines: (pages: unknown[], rows: Row[]) => Row[];
}>("verifyQuotes.js", ["verifyQuotes", "readBoqLines"]);

const pages = [
  { page: 1, text: "NOTICE INVITING TENDER\nName of work: SITC of LT panels" },
  {
    page: 2,
    text: "Minimum Average Annual Turnover of the bidder (For 3 Years): 50 Lakh(s)\nYears of Past Experience Required: 3 Year(s)",
  },
  { page: 3, text: "The bidder shall submit a Manufacturer’s Authorization Form (MAF) from the OEM for the offered" },
  { page: 4, text: "make, valid for this tender. EMD Amount: 1,25,000" },
];

describe("verifyQuotes", () => {
  it("accepts an exact quote despite different spacing, case and curly quotes", () => {
    const [r] = verifyQuotes(pages, [{ page: 2, quote: "minimum average annual turnover of the bidder  (for 3 years): 50 lakh(s)" }]);
    expect(r.verified).toBe(true);
    expect(r.verifyNote).toBeNull();
    const [r2] = verifyQuotes(pages, [{ page: 3, quote: "Manufacturer's Authorization Form (MAF)" }]);
    expect(r2.verified).toBe(true);
  });

  it("accepts a quote that runs over a page break", () => {
    const [r] = verifyQuotes(pages, [{ page: 3, quote: "from the OEM for the offered make, valid for this tender" }]);
    expect(r.verified).toBe(true);
  });

  it("tolerates one small extraction difference in a long quote", () => {
    const quote =
      "Minimum Average Annual Turnover of the bidder For 3 Years 50 Lakh s Years of Past Experience Required 3 Year s plus";
    const [r] = verifyQuotes(pages, [{ page: 2, quote }]);
    expect(r.verified).toBe(true);
  });

  it("rejects an invented quote", () => {
    const [r] = verifyQuotes(pages, [{ page: 2, quote: "Minimum turnover of 5 crore in each of the last 5 years" }]);
    expect(r.verified).toBe(false);
    expect(r.verifyNote).toBe("Quote not found on page 2");
  });

  it("rejects a real quote cited on the wrong page and says where it is", () => {
    const [r] = verifyQuotes(pages, [{ page: 1, quote: "Years of Past Experience Required: 3 Year(s)" }]);
    expect(r.verified).toBe(false);
    expect(r.verifyNote).toBe("Quote is on page 2, not page 1");
  });

  it("rejects a missing page, missing quote, or a page that doesn't exist", () => {
    const out = verifyQuotes(pages, [
      { page: null, quote: "EMD Amount" },
      { page: 4, quote: null },
      { page: 4, quote: "   " },
      { page: 99, quote: "EMD Amount" },
    ]);
    expect(out.map((r) => r.verified)).toEqual([false, false, false, false]);
    expect(out[3].verifyNote).toBe("Page 99 does not exist in this PDF");
  });

  describe("readBoqLines (quantity read from the printed line)", () => {
    const boqPages = [
      {
        page: 140,
        text:
          "Bill of Quantities (BOQ)\nS.No. | Item Description | Unit | Quantity\n" +
          "1 | Supply, installation, testing and commissioning of MCB 6A SP C-curve 10kA | Nos | 120\n" +
          "15 | Supply, installation, testing and commissioning of LT XLPE armoured aluminium cable 4 core 16 sq mm 1.1 kV | Mtr | 600\n" +
          "27 | Supply, installation, testing and commissioning of Street light pole 9 m octagonal with LED fitting 90W | Nos | 12",
      },
      { page: 55, text: "7 | Providing and fixing LED panel light 36W 2x2 ft recessed | Nos | 85 | 2050.00 | 184250.00" },
      { page: 5, text: "2 Supply of MCB 63A FP C-curve 10kA as per IS/IEC 60898 Nos 6 2,000.00 12,000.00" },
    ];
    const row = (page: number, quote: string, qty: number | null = null, unit: string | null = null): Row => ({ page, quote, qty, unit, verified: true });

    it("fills quantities and units the AI left empty, in each tender format", () => {
      const out = readBoqLines(boqPages, [
        row(140, "Supply, installation, testing and commissioning of MCB 6A SP C-curve 10kA"),
        row(140, "Supply, installation, testing and commissioning of LT XLPE armoured aluminium cable 4 core 16 sq mm"),
        row(140, "Supply, installation, testing and commissioning of Street light pole 9 m octagonal"),
        row(55, "Providing and fixing LED panel light 36W"),
        row(5, "Supply of MCB 63A FP C-curve 10kA"),
      ]);
      expect(out.map((r) => [r.qty, r.unit])).toEqual([[120, "Nos"], [600, "Mtr"], [12, "Nos"], [85, "Nos"], [6, "Nos"]]);
    });

    it("keeps the AI's quantity when it agrees, and marks a disagreement", () => {
      const [same, differs] = readBoqLines(boqPages, [
        row(55, "Providing and fixing LED panel light 36W", 85, "Nos"),
        row(55, "Providing and fixing LED panel light 36W", 58, "Nos"),
      ]);
      expect(same.qtyMismatch).toBeUndefined();
      expect(differs.qty).toBe(58);
      expect(differs.qtyMismatch).toBe(85);
    });

    it("tells apart lines that start with the same words, using the full description", () => {
      const page = {
        page: 143,
        text:
          "17 | Supply, installation, testing and commissioning of LT XLPE armoured aluminium cable 3.5 core 95 sq mm 1.1 kV | Mtr | 180\n" +
          "18 | Supply, installation, testing and commissioning of LT XLPE armoured aluminium cable 3.5 core 185 sq mm 1.1 kV | Mtr | 120",
      };
      const quote = "Supply, installation, testing and commissioning of LT XLPE armoured aluminium cable 3.5 core";
      const [r17, r18] = readBoqLines([page], [
        { ...row(143, quote), description: quote + " 95 sq mm 1.1 kV" } as Row,
        { ...row(143, quote, 120, "Mtr"), description: quote + " 185 sq mm 1.1 kV" } as Row,
      ]);
      expect(r17.qty).toBe(180);
      expect(r18.qty).toBe(120);
      expect(r18.qtyMismatch).toBeUndefined();
      // Without a description to tell them apart, nothing is guessed.
      const [unsure] = readBoqLines([page], [row(143, quote)]);
      expect(unsure.qty).toBeNull();
    });

    it("leaves unverified rows and lines it can't find untouched", () => {
      const [unverified, missing] = readBoqLines(boqPages, [
        { ...row(140, "Supply, installation, testing and commissioning of MCB 6A SP C-curve 10kA"), verified: false },
        row(140, "Supply of transformer 500 kVA"),
      ]);
      expect(unverified.qty).toBeNull();
      expect(missing.qty).toBeNull();
    });
  });

  it("does not accept a short quote by fuzzy matching", () => {
    const [r] = verifyQuotes(pages, [{ page: 4, quote: "EMD Amount: 1,50,000" }]);
    expect(r.verified).toBe(false);
  });
});
