import { describe, expect, it } from "vitest";
import { loadN8nCode } from "./loadN8nCode";

type Item = { page: number | null; quote: string | null };
type Checked = Item & { verified: boolean; verifyNote: string | null };
const { verifyQuotes } = loadN8nCode<{ verifyQuotes: (pages: unknown[], items: Item[]) => Checked[] }>(
  "verifyQuotes.js",
  ["verifyQuotes"],
);

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

  it("does not accept a short quote by fuzzy matching", () => {
    const [r] = verifyQuotes(pages, [{ page: 4, quote: "EMD Amount: 1,50,000" }]);
    expect(r.verified).toBe(false);
  });
});
