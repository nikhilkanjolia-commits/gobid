import { describe, expect, it } from "vitest";
import firmProfile from "../data/firm-profile.json";
import { loadN8nCode } from "./loadN8nCode";

type Clause = {
  type: string;
  requirement?: string;
  values?: Record<string, unknown>;
  page: number | null;
  quote: string | null;
  verified: boolean;
  verifyNote?: string | null;
};
type Row = { type: string; label: string; result: string; reason: string; page: number | null; firmHas: string | null };
const { evaluateEligibility } = loadN8nCode<{
  evaluateEligibility: (clauses: Clause[], firm: typeof firmProfile, today: string) => Row[];
}>("rules.js", ["evaluateEligibility"]);

const TODAY = "2026-10-22";
const firm = firmProfile;

// A verified clause with a page and quote; tests override the parts they care about.
function clause(type: string, values: Record<string, unknown>, extra: Partial<Clause> = {}): Clause {
  return { type, values, requirement: type, page: 5, quote: "quote", verified: true, verifyNote: null, ...extra };
}

// The four core clauses, all passing for the sample firm, so each test changes one thing.
function passingCore(): Clause[] {
  return [
    clause("emd", { required: true, amountInr: 125000 }),
    clause("turnover", { minAvgAnnualInr: 5000000 }),
    clause("experience", { years: 3 }),
    clause("oem_authorization", { required: true, brands: ["Havells"] }),
  ];
}

function only(rows: Row[], type: string) {
  const found = rows.filter((r) => r.type === type);
  expect(found).toHaveLength(1);
  return found[0];
}

describe("sample firm profile", () => {
  it("has every field the rules read", () => {
    expect(typeof firm.avgAnnualTurnoverInr).toBe("number");
    expect(typeof firm.yearsOfExperience).toBe("number");
    expect(typeof firm.isMSE).toBe("boolean");
    expect(typeof firm.markupPct).toBe("number");
    expect(typeof firm.minMarginPct).toBe("number");
    expect(Array.isArray(firm.pastOrders) && Array.isArray(firm.certificates) && Array.isArray(firm.oemAuthorizations)).toBe(true);
  });
});

describe("evaluateEligibility", () => {
  it("passes the core clauses when the firm meets them", () => {
    const rows = evaluateEligibility(passingCore(), firm, TODAY);
    expect(rows.map((r) => r.result)).toEqual(["pass", "pass", "pass", "pass"]);
  });

  it("never passes a clause whose quote wasn't verified", () => {
    const clauses = passingCore();
    clauses[1] = { ...clauses[1], verified: false, verifyNote: "Quote not found on page 5" };
    const row = only(evaluateEligibility(clauses, firm, TODAY), "turnover");
    expect(row.result).toBe("unknown");
    expect(row.reason).toContain("Quote not found on page 5");
  });

  it("marks a core clause the AI didn't find as unknown, not pass", () => {
    const rows = evaluateEligibility(passingCore().filter((c) => c.type !== "turnover"), firm, TODAY);
    const row = only(rows, "turnover");
    expect(row.result).toBe("unknown");
    expect(row.page).toBeNull();
    expect(row.reason).toContain("Not found");
  });

  it("marks unreadable values as unknown", () => {
    const clauses = passingCore();
    clauses[1] = clause("turnover", { minAvgAnnualInr: null });
    clauses[3] = clause("oem_authorization", { required: true, brands: [] });
    const rows = evaluateEligibility(clauses, firm, TODAY);
    expect(only(rows, "turnover").result).toBe("unknown");
    expect(only(rows, "oem_authorization").result).toBe("unknown");
  });

  it("fails turnover below the minimum, unless the tender grants an MSE exemption", () => {
    const clauses = passingCore();
    clauses[1] = clause("turnover", { minAvgAnnualInr: 50000000 });
    expect(only(evaluateEligibility(clauses, firm, TODAY), "turnover").result).toBe("fail");

    const withExemption = [...clauses, clause("mse_exemption", { experienceAndTurnover: true, emd: true }, { page: 9 })];
    const row = only(evaluateEligibility(withExemption, firm, TODAY), "turnover");
    expect(row.result).toBe("pass");
    expect(row.reason).toContain("p. 9");
  });

  it("does not assume an MSE exemption the tender refuses or doesn't state", () => {
    const clauses = [...passingCore(), clause("mse_exemption", { experienceAndTurnover: false, emd: null })];
    clauses[1] = clause("turnover", { minAvgAnnualInr: 50000000 });
    expect(only(evaluateEligibility(clauses, firm, TODAY), "turnover").result).toBe("fail");
  });

  it("ignores an MSE exemption whose quote wasn't verified", () => {
    const clauses = [...passingCore(), clause("mse_exemption", { experienceAndTurnover: true }, { verified: false })];
    clauses[1] = clause("turnover", { minAvgAnnualInr: 50000000 });
    expect(only(evaluateEligibility(clauses, firm, TODAY), "turnover").result).toBe("fail");
  });

  it("checks experience by years and by order options (any option is enough)", () => {
    const rows = (values: Record<string, unknown>) => {
      const c = passingCore();
      c[2] = clause("experience", values);
      return only(evaluateEligibility(c, firm, TODAY), "experience");
    };
    expect(rows({ years: 10 }).result).toBe("fail");
    // Firm has orders of 42, 26 and 18.5 lakh.
    expect(rows({ orderOptions: [{ count: 3, eachAtLeastInr: 2000000 }, { count: 1, eachAtLeastInr: 4000000 }] }).result).toBe("pass");
    expect(rows({ orderOptions: [{ count: 2, eachAtLeastInr: 3000000 }] }).result).toBe("fail");
  });

  it("checks OEM authorization brand and expiry", () => {
    const oem = (values: Record<string, unknown>, today = TODAY) => {
      const c = passingCore();
      c[3] = clause("oem_authorization", values);
      return only(evaluateEligibility(c, firm, today), "oem_authorization");
    };
    expect(oem({ required: true, brands: ["Make X"] }).result).toBe("fail");
    expect(oem({ required: true, brands: ["Make X", "HAVELLS"] }).result).toBe("pass");
    // Polycab's authorization runs to 2026-12-31.
    const expired = oem({ required: true, brands: ["Polycab"] }, "2027-01-15");
    expect(expired.result).toBe("fail");
    expect(expired.reason).toContain("expired");
    expect(oem({ required: false }).result).toBe("pass");
  });

  it("checks certificates are held and not expired", () => {
    const cert = (name: string) =>
      only(evaluateEligibility([...passingCore(), clause("certificate", { name })], firm, TODAY), "certificate");
    expect(cert("ISO 9001:2015").result).toBe("pass");
    expect(cert("BIS certification").result).toBe("fail");
    // The sample ISO 14001 expired on 2026-05-31.
    const expired = cert("ISO 14001");
    expect(expired.result).toBe("fail");
    expect(expired.reason).toContain("expired");
  });

  it("checks the firm can supply an approved make in every item group", () => {
    const makes = (items: unknown[]) =>
      only(evaluateEligibility([...passingCore(), clause("approved_makes", { items })], firm, TODAY), "approved_makes");
    expect(makes([{ itemGroup: "MCB", brands: ["Havells", "Legrand"] }, { itemGroup: "Cables", brands: ["Polycab"] }]).result).toBe("pass");
    const row = makes([{ itemGroup: "MCCB", brands: ["Schneider", "ABB"] }]);
    expect(row.result).toBe("fail");
    expect(row.reason).toContain("MCCB");
  });

  it("treats EMD as something to arrange, exempt only when the tender says so", () => {
    expect(only(evaluateEligibility(passingCore(), firm, TODAY), "emd").reason).toContain("Arrange EMD");
    const exempt = [...passingCore(), clause("mse_exemption", { emd: true })];
    expect(only(evaluateEligibility(exempt, firm, TODAY), "emd").reason).toContain("exempt");
  });

  it("lists failures first, then unknowns", () => {
    const clauses = passingCore().filter((c) => c.type !== "emd");
    clauses[0] = clause("turnover", { minAvgAnnualInr: 90000000 });
    const results = evaluateEligibility(clauses, firm, TODAY).map((r) => r.result);
    expect(results).toEqual(["fail", "unknown", "pass", "pass"]);
  });
});
