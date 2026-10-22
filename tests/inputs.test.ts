import { describe, expect, it } from "vitest";
import { checkPages } from "../src/lib/pdfText";
import { mergePriceLists, parsePriceList } from "../src/lib/priceList";

const HEADER = "sku,description,brand,unit,list_price,discount_pct";

describe("parsePriceList", () => {
  it("reads a good file, including ₹ signs, commas and optional columns", () => {
    const r = parsePriceList("a.csv", `${HEADER},rating_kA,poles\nX1,"MCCB 100A TP",Havells,Nos,"₹12,600.50",32%,36,3\n`);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ sku: "X1", listPrice: 12600.5, discountPct: 32, ratingKA: 36, poles: 3, source: "a.csv" });
  });

  it("accepts common column-name variants", () => {
    const r = parsePriceList("a.csv", "Item Code,Description,Make,UOM,MRP,Discount\nX1,MCB,Havells,Nos,240,38\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it("rejects an empty file", () => {
    expect(parsePriceList("a.csv", "  \n").errors).toEqual(["a.csv: the file is empty"]);
  });

  it("rejects a header with no rows", () => {
    expect(parsePriceList("a.csv", `${HEADER}\n`).errors).toEqual(["a.csv: no price rows under the header"]);
  });

  it("names a missing column", () => {
    const r = parsePriceList("a.csv", "sku,description,brand,unit,discount_pct\nX1,MCB,Havells,Nos,38\n");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toContain('missing column "list_price"');
  });

  it("names the line and the bad value, and loads nothing from a broken file", () => {
    const r = parsePriceList("a.csv", `${HEADER}\nX1,MCB,Havells,Nos,240,38\nX2,MCB,Havells,Nos,abc,38\nX3,,Havells,Nos,240,120\n`);
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toBe('a.csv line 3: list_price "abc" is not a positive number');
    expect(r.errors[1]).toContain("a.csv line 4: description is empty");
    expect(r.errors[1]).toContain('discount_pct "120" must be a number from 0 to 99');
  });

  it("lists at most 10 problems", () => {
    const bad = Array.from({ length: 15 }, (_, i) => `X${i},MCB,Havells,Nos,free,38`).join("\n");
    const r = parsePriceList("a.csv", `${HEADER}\n${bad}\n`);
    expect(r.errors).toHaveLength(11);
    expect(r.errors[10]).toContain("5 more problems");
  });

  it("warns about a SKU in two files and keeps the first", () => {
    const a = parsePriceList("a.csv", `${HEADER}\nX1,MCB,Havells,Nos,240,38\n`);
    const b = parsePriceList("b.csv", `${HEADER}\nx1,MCB,Havells,Nos,999,0\n`);
    const merged = mergePriceLists([a, b]);
    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0].listPrice).toBe(240);
    expect(merged.warnings[0]).toContain("appears in both a.csv and b.csv");
  });

  it("returns no rows if any list has errors", () => {
    const good = parsePriceList("a.csv", `${HEADER}\nX1,MCB,Havells,Nos,240,38\n`);
    const bad = parsePriceList("b.csv", "");
    expect(mergePriceLists([good, bad]).rows).toEqual([]);
  });
});

describe("checkPages (PDF text check)", () => {
  const textPage = (page: number) => ({ page, text: "Minimum average annual turnover of the bidder for three years shall be 50 lakh" });
  const blankPage = (page: number) => ({ page, text: " " });

  it("accepts a text PDF with a few image pages", () => {
    const pages = [textPage(1), textPage(2), textPage(3), blankPage(4)];
    expect(checkPages(pages).ok).toBe(true);
  });

  it("rejects a PDF with no pages", () => {
    expect(checkPages([])).toEqual({ ok: false, error: "This PDF has no pages." });
  });

  it("rejects a fully scanned PDF", () => {
    const r = checkPages([blankPage(1), blankPage(2)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("looks scanned");
  });

  it("rejects a PDF where most pages are images", () => {
    const r = checkPages([textPage(1), blankPage(2), blankPage(3)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("2 of 3 pages");
  });
});
