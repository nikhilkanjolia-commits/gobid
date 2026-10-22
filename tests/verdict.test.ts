import { describe, expect, it } from "vitest";
import { loadN8nCode } from "./loadN8nCode";

type Row = { label: string; result: string; reason: string; page: number | null };
type Totals = { costTotal: number; bidTotal: number; marginPct: number | null; pricedLines: number; totalLines: number; unpricedLines: number; redLines: number; amberLines: number };
type Verdict = { decision: string; reason: string; blockers: string[]; counts: Record<string, number> };
const { decide } = loadN8nCode<{ decide: (rows: Row[], boq: { totals: Totals }, firm: { minMarginPct: number }) => Verdict }>(
  "verdict.js",
  ["decide"],
);

const firm = { minMarginPct: 8 };
const pass = (label: string): Row => ({ label, result: "pass", reason: "ok", page: 3 });
const cleanBoq = (over: Partial<Totals> = {}) => ({
  totals: { costTotal: 1620000, bidTotal: 1863000, marginPct: 13.04, pricedLines: 42, totalLines: 42, unpricedLines: 0, redLines: 0, amberLines: 0, ...over },
});
const allPass = [pass("EMD"), pass("Minimum turnover"), pass("Past experience"), pass("OEM authorization (MAF)")];

describe("decide", () => {
  it("says GO only when everything is verified and passes", () => {
    const v = decide(allPass, cleanBoq(), firm);
    expect(v.decision).toBe("GO");
    expect(v.reason).toContain("42 BOQ lines priced at ₹18,63,000");
  });

  it("says NO-GO on any failed clause and names it with its page", () => {
    const rows = [{ label: "OEM authorization (MAF)", result: "fail", reason: "Needs authorization from Make X; firm holds Havells", page: 47 }, ...allPass.slice(0, 3)];
    const v = decide(rows, cleanBoq(), firm);
    expect(v.decision).toBe("NO-GO");
    expect(v.reason).toContain("OEM authorization (MAF): Needs authorization from Make X; firm holds Havells (p. 47)");
  });

  it("says NO-GO when the margin is below the firm's minimum", () => {
    expect(decide(allPass, cleanBoq({ marginPct: 5 }), firm).decision).toBe("NO-GO");
  });

  it("never says GO with an unknown clause", () => {
    const rows = [...allPass.slice(1), { label: "EMD", result: "unknown", reason: "Not found in the tender; check manually", page: null }];
    const v = decide(rows, cleanBoq(), firm);
    expect(v.decision).toBe("REVIEW NEEDED");
    expect(v.reason).toContain("EMD: Not found");
  });

  it("never says GO with red or unpriced BOQ lines, or no BOQ at all", () => {
    expect(decide(allPass, cleanBoq({ redLines: 3 }), firm).decision).toBe("REVIEW NEEDED");
    expect(decide(allPass, cleanBoq({ unpricedLines: 2 }), firm).decision).toBe("REVIEW NEEDED");
    const none = decide(allPass, cleanBoq({ totalLines: 0, pricedLines: 0, marginPct: null }), firm);
    expect(none.decision).toBe("REVIEW NEEDED");
    expect(none.reason).toContain("No BOQ lines were found");
  });

  it("still says GO with amber lines, but mentions them", () => {
    const v = decide(allPass, cleanBoq({ amberLines: 3 }), firm);
    expect(v.decision).toBe("GO");
    expect(v.reason).toContain("3 line(s) worth a second look");
  });

  it("puts NO-GO ahead of review items", () => {
    const rows = [{ label: "Minimum turnover", result: "fail", reason: "Needs ₹5 crore", page: 2 }, { label: "EMD", result: "unknown", reason: "x", page: null }];
    expect(decide(rows, cleanBoq({ redLines: 1 }), firm).decision).toBe("NO-GO");
  });
});
