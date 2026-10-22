import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import demoAnswers from "../data/demo/ai-answers.json";
import demoPages from "../data/demo/tender-pages.json";
import firm from "../data/firm-profile.json";
import { mergePriceLists, parsePriceList } from "../src/lib/priceList";
import { loadN8nCode } from "./loadN8nCode";

// Bid Readiness acceptance tests (A–D) on the real rules code, with the demo tender and
// made-up supporting documents. The AI's answers are written by hand here; every status comes
// from the rules.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const L = loadN8nCode<Record<string, (...a: Any[]) => Any>>(
  ["verifyQuotes.js", "rules.js", "shortlist.js", "matchChecks.js", "pricing.js", "verdict.js", "requests.js", "readiness.js", "finalize.js"],
  ["finalizeResult", "toDocRequirements", "toSupportingDocs", "uniqueItems", "technicalCompliance", "computeReadiness", "checkSupportingDocs", "tenderReference"],
);
const TODAY = "2026-10-22";
const priceRows = mergePriceLists(
  ["switchgear-supplier.csv", "cables-supplier.csv"].map((f) => parsePriceList(f, readFileSync(`public/samples/${f}`, "utf8"))),
).rows;

// A supporting document: its text, and the AI's reading of it with evidence quotes.
function doc(name: string, text: string, ai: Record<string, Any>, evidence: [string, string][]): { file: Any; ai: Record<string, Any> } {
  return {
    file: { name, pages: [{ page: 1, text }], unreadable: false, error: null },
    ai: { docType: "other", title: name, productCategories: [], ...ai, evidence: evidence.map(([field, quote]) => ({ field, page: 1, quote })) },
  };
}

const MAF_TEXT =
  "MANUFACTURER'S AUTHORIZATION FORM\nRef: SE/MAF/2026/118 Date: 15/10/2026\nWe, Schneider Electric India Pvt Ltd, hereby authorize Shree Ganesh Electricals " +
  "to quote and supply our MCCB and switchgear products against bid GEM/2026/B/0000001 in the territory of Rajasthan.\n" +
  "This authorization is valid up to 31/03/2027.\nFor Schneider Electric India Pvt Ltd, Ravi Mehta, Regional Sales Manager";
const goodMaf = () =>
  doc(
    "MAF-Schneider.pdf",
    MAF_TEXT,
    {
      docType: "oem_authorization",
      manufacturer: "Schneider Electric India Pvt Ltd",
      holder: "Shree Ganesh Electricals",
      productCategories: ["MCCB", "switchgear"],
      tenderReference: "GEM/2026/B/0000001",
      territory: "Rajasthan",
      issueDate: "2026-10-15",
      validUntil: "2027-03-31",
      signatory: "Ravi Mehta, Regional Sales Manager",
    },
    [
      ["manufacturer", "We, Schneider Electric India Pvt Ltd, hereby authorize Shree Ganesh Electricals"],
      ["holder", "hereby authorize Shree Ganesh Electricals to quote and supply"],
      ["productCategories", "supply our MCCB and switchgear products"],
      ["tenderReference", "against bid GEM/2026/B/0000001"],
      ["territory", "in the territory of Rajasthan"],
      ["issueDate", "Ref: SE/MAF/2026/118 Date: 15/10/2026"],
      ["validUntil", "This authorization is valid up to 31/03/2027."],
      ["signatory", "Ravi Mehta, Regional Sales Manager"],
    ],
  );

function run(opts: { docs?: ReturnType<typeof doc>[]; matches?: Any[]; documents?: Any[]; firmOverride?: Any } = {}) {
  const docs = opts.docs ?? [];
  return L.finalizeResult({
    pages: demoPages,
    clauses: demoAnswers.clauses,
    docRequirements: L.toDocRequirements({ documents: opts.documents ?? demoAnswers.documents }),
    boqRows: L.uniqueItems(demoAnswers.boqRows),
    matches: opts.matches ?? demoAnswers.matches,
    priceRows,
    firm: opts.firmOverride ?? firm,
    today: TODAY,
    supportingFiles: docs.map((d) => d.file),
    supportingAi: L.toSupportingDocs({ documents: docs.map((d, i) => ({ docIndex: i + 1, ...d.ai })) }, docs.length),
  }).readiness;
}
const docStatus = (r: Any, docType: string) => r.documents.find((d: Any) => d.docType === docType);

describe("Test A: complete tender with supporting documents", () => {
  it("shows document readiness, OEM fields, technical comparisons, evidence and a rule-based status", () => {
    const iso = doc(
      "ISO9001.pdf",
      "CERTIFICATE OF REGISTRATION\nThis is to certify that Shree Ganesh Electricals has been assessed and found to conform to ISO 9001:2015.\nCertificate No: QMS/IN/4471\nValid until: 30 June 2027",
      { docType: "iso_certificate", holder: "Shree Ganesh Electricals", standard: "ISO 9001:2015", certificateNumber: "QMS/IN/4471", validUntil: "2027-06-30" },
      [
        ["holder", "This is to certify that Shree Ganesh Electricals has been assessed"],
        ["standard", "found to conform to ISO 9001:2015"],
        ["certificateNumber", "Certificate No: QMS/IN/4471"],
        ["validUntil", "Valid until: 30 June 2027"],
      ],
    );
    const r = run({ docs: [goodMaf(), iso] });
    expect(r.oem.status).toBe("verified");
    expect(r.oem.fields.map((f: Any) => f.result)).not.toContain("conflict");
    expect(docStatus(r, "oem_authorization").status).toBe("Verified");
    const isoRow = docStatus(r, "iso_certificate");
    expect(isoRow.status).toBe("Verified");
    expect(isoRow.page).toBe(3);
    expect(isoRow.quote).toContain("ISO 9001");
    // Turnover/experience proof weren't uploaded: Missing, so not ready.
    expect(docStatus(r, "turnover_evidence").status).toBe("Missing");
    expect(r.compliance.length).toBe(9);
    expect(r.summary.status).toBe("Potential disqualification");
    expect(r.summary.counts.passed).toBeGreaterThan(5);
    expect(r.summary.boqTotal).toBeGreaterThan(0);
    expect(r.tenderReference).toBe("GEM/2026/B/0000001");
  });
});

describe("Test B: missing OEM authorization", () => {
  it("flags the missing MAF with the tender evidence and a next action, and never passes it", () => {
    const r = run();
    const maf = docStatus(r, "oem_authorization");
    expect(maf.status).toBe("Missing");
    expect(maf.requirement).toBe("required");
    expect(maf.page).toBe(3);
    expect(maf.quote).toContain("Manufacturer's Authorization Form (MAF) from Schneider Electric");
    expect(maf.action).toContain("Request a MAF from Schneider");
    expect(r.oem.status).toBe("missing");
    expect(r.summary.status).toBe("Potential disqualification");
    expect(r.summary.criticalDocuments).toContain(maf.name);
    expect(r.summary.actions[0].priority).toBe(1);
  });

  it("rejects a letter from the wrong make, for another bidder, for another bid, or expired", () => {
    const bad = goodMaf();
    bad.file.pages[0].text = MAF_TEXT.replace(/Schneider Electric India Pvt Ltd/g, "Havells India Ltd");
    bad.ai.manufacturer = "Havells India Ltd";
    bad.ai.evidence[0].quote = "We, Havells India Ltd, hereby authorize Shree Ganesh Electricals";
    const wrongMake = run({ docs: [bad] });
    expect(wrongMake.oem.status).toBe("conflict");
    expect(wrongMake.oem.fields.find((f: Any) => f.field === "Manufacturer / OEM").result).toBe("conflict");
    expect(docStatus(wrongMake, "oem_authorization").status).toBe("Missing");

    const expired = run({ docs: [goodMaf()], firmOverride: firm }).oem;
    expect(expired.status).toBe("verified");
    const later = L.finalizeResult({
      pages: demoPages,
      clauses: demoAnswers.clauses,
      docRequirements: L.toDocRequirements(demoAnswers),
      boqRows: L.uniqueItems(demoAnswers.boqRows),
      matches: demoAnswers.matches,
      priceRows,
      firm,
      today: "2027-05-01",
      supportingFiles: [goodMaf().file],
      supportingAi: L.toSupportingDocs({ documents: [{ docIndex: 1, ...goodMaf().ai }] }, 1),
    }).readiness;
    expect(later.oem.status).toBe("conflict");
    expect(later.oem.fields.find((f: Any) => f.field === "Valid until").note).toBe("Expired");
  });
});

describe("OEM letter name and scope matching (found in the live run)", () => {
  const lntLetter = () =>
    doc(
      "MAF-LT.pdf",
      "We, Larsen & Toubro Limited, manufacturers of LT panels and MCCBs, hereby authorize Shree Ganesh Electricals against bid GEM/2026/B/0000001. Valid up to 31/12/2027. Date: 01/10/2026. Anil Kapoor, Regional Manager",
      {
        docType: "oem_authorization",
        manufacturer: "Larsen & Toubro Limited",
        holder: "Shree Ganesh Electricals",
        productCategories: ["LT panels", "MCCBs"],
        tenderReference: "GEM/2026/B/0000001",
        issueDate: "2026-10-01",
        validUntil: "2027-12-31",
        signatory: "Anil Kapoor, Regional Manager",
      },
      [
        ["manufacturer", "We, Larsen & Toubro Limited, manufacturers of LT panels and MCCBs"],
        ["holder", "hereby authorize Shree Ganesh Electricals against bid"],
        ["productCategories", "manufacturers of LT panels and MCCBs"],
        ["tenderReference", "against bid GEM/2026/B/0000001"],
        ["issueDate", "Date: 01/10/2026"],
        ["validUntil", "Valid up to 31/12/2027."],
        ["signatory", "Anil Kapoor, Regional Manager"],
      ],
    );
  const clauses = demoAnswers.clauses.map((c) =>
    c.type === "oem_authorization" ? { ...c, values: { required: true, brands: ["L&T"] }, makes: ["L&T"] } : c,
  );
  const runWith = (letter: ReturnType<typeof doc>, today = TODAY) =>
    L.finalizeResult({
      pages: demoPages,
      clauses,
      docRequirements: [],
      boqRows: L.uniqueItems(demoAnswers.boqRows),
      matches: demoAnswers.matches,
      priceRows,
      firm,
      today,
      supportingFiles: [letter.file],
      supportingAi: L.toSupportingDocs({ documents: [{ docIndex: 1, ...letter.ai }] }, 1),
    }).readiness.oem;

  it("treats 'L&T' and 'Larsen & Toubro Limited' as the same make, and plural product names as covering the items", () => {
    // The demo clause quote names Schneider, but the brands here are L&T: the comparison is by name only.
    const oem = runWith(lntLetter());
    expect(oem.fields.find((f: Any) => f.field === "Manufacturer / OEM").result).toBe("match");
    expect(oem.fields.find((f: Any) => f.field === "Product family").result).toBe("match");
  });

  it("lets a verified uploaded letter settle the OEM eligibility clause the firm profile can't", () => {
    const pass = { type: "x", result: "pass", label: "x", reason: "ok", page: 1, quote: "q" };
    const oemFail = { type: "oem_authorization", result: "fail", label: "OEM authorization (MAF)", reason: "Needs authorization from L&T", page: 24, quote: "q" };
    const base = { documents: [], compliance: [], boqTotals: null };
    expect(L.computeReadiness({ ...base, eligibility: [pass, oemFail], oem: { status: "verified", letterFile: "maf.pdf" } }).status).toBe("Ready for human review");
    expect(L.computeReadiness({ ...base, eligibility: [pass, oemFail], oem: { status: "needs_review", letterFile: "maf.pdf", reason: "Issue date…" } }).status).toBe("Review required");
    expect(L.computeReadiness({ ...base, eligibility: [pass, oemFail], oem: { status: "missing" } }).status).toBe("Potential disqualification");
  });

  it("asks for a check when the letter is dated after today", () => {
    const oem = runWith(lntLetter(), "2026-09-01");
    expect(oem.fields.find((f: Any) => f.field === "Issue date")).toMatchObject({ result: "review", note: "Dated in the future: check the date" });
    expect(oem.status).toBe("needs_review");
  });
});

describe("Test C: technical mismatch", () => {
  it("fails a 25 kA breaker offered for a 36 kA requirement even with a confident match", () => {
    const r = run();
    const item3 = r.compliance.find((c: Any) => c.item === "3");
    expect(item3.description).toContain("36kA");
    expect(item3.sku).toBe("HV-MCCB-100-25");
    expect(item3.status).toBe("Not compliant");
    const ka = item3.params.find((p: Any) => p.parameter === "Breaking capacity");
    expect(ka).toMatchObject({ required: "36 kA", product: "25 kA", result: "mismatch" });
    expect(r.summary.technicalMismatches.join(" ")).toContain("Item 3");
    expect(r.summary.status).toBe("Potential disqualification");
  });

  it("accepts a higher breaking capacity and the exact match as compliant", () => {
    const matches = demoAnswers.matches.map((m) => (m.item === "3" ? { ...m, sku: "HV-MCCB-100-36", confidence: 0.95 } : m));
    const item3 = run({ matches }).compliance.find((c: Any) => c.item === "3");
    expect(item3.params.find((p: Any) => p.parameter === "Breaking capacity").result).toBe("match");
    // Still flagged for make: Havells isn't an approved MCCB make in the demo tender.
    expect(item3.status).toBe("Needs review");
  });
});

describe("Test D: uncertain evidence", () => {
  it("marks a requirement whose quote isn't in the tender as Needs review, not established", () => {
    const documents = [{ docType: "bis_certificate", name: "BIS licence", requirement: "required", condition: null, page: 3, quote: "Bidder must hold a BIS licence for all cables." }];
    const row = docStatus(run({ documents }), "bis_certificate");
    expect(row.status).toBe("Needs review");
    expect(row.requirement).toBe("not established");
  });

  it("keeps conditional requirements in review instead of calling them missing", () => {
    const documents = [{ docType: "local_content_declaration", name: "Local content declaration", requirement: "conditional", condition: "if claiming purchase preference", page: 2, quote: "EMD Amount: 37,000" }];
    expect(docStatus(run({ documents }), "local_content_declaration").status).toBe("Needs review");
  });

  it("doesn't trust a document field whose quote isn't in the document", () => {
    const fake = goodMaf();
    fake.ai.evidence = fake.ai.evidence.map((e: Any) => (e.field === "validUntil" ? { ...e, quote: "valid up to 31/03/2030" } : e));
    fake.ai.validUntil = "2030-03-31";
    const r = run({ docs: [fake] });
    expect(r.supportingDocs[0].unverifiedFields).toContain("validUntil");
    expect(r.oem.status).toBe("needs_review");
    expect(r.oem.fields.find((f: Any) => f.field === "Valid until").result).toBe("missing");
  });

  it("reports an unreadable (scanned) supporting document instead of analysing it", () => {
    const scanned = { file: { name: "scan.pdf", pages: [], unreadable: true, error: "This PDF has no readable text; it looks scanned." }, ai: null };
    const r = L.checkSupportingDocs([scanned.file], []);
    expect(r[0]).toMatchObject({ readable: false, problem: "This PDF has no readable text; it looks scanned." });
  });

  it("flags a BOQ item whose parameters aren't in the catalogue, or that has no match", () => {
    const r = run();
    expect(r.compliance.find((c: Any) => c.item === "9")).toMatchObject({ status: "Needs review", reason: "No product matched in the price lists" });
    const rows = [{ item: "1", description: "Cable 4 core 95 sq mm 1.1 kV", page: 1, sku: "X", confidence: 0.9, flags: [] }];
    const c = L.technicalCompliance(rows, [{ sku: "X", description: "Armoured cable", brand: "Polycab", ratingKA: null, poles: null, source: "a.csv" }])[0];
    expect(c.status).toBe("Needs review");
    const specs = c.params.filter((p: Any) => p.parameter !== "Make");
    expect(specs.map((p: Any) => p.parameter)).toEqual(["Cores", "Conductor size", "Voltage grade"]);
    expect(specs.every((p: Any) => p.result === "unknown" && p.product === null)).toBe(true);
  });

  it("is Ready for human review only when every check passes", () => {
    const pass = { result: "pass", label: "x", reason: "ok", page: 1, quote: "q" };
    const ready = L.computeReadiness({ eligibility: [pass], documents: [{ status: "Verified", requirement: "required" }], oem: { status: "not_required" }, compliance: [{ status: "Compliant" }], boqTotals: { bidTotal: 100, marginPct: 13 } });
    expect(ready.status).toBe("Ready for human review");
    const unknown = L.computeReadiness({ eligibility: [pass, { ...pass, result: "unknown" }], documents: [], oem: { status: "not_required" }, compliance: [], boqTotals: null });
    expect(unknown.status).toBe("Review required");
  });

  it("cleans up malformed AI output instead of trusting it", () => {
    const reqs = L.toDocRequirements({ documents: [{ docType: "weird", name: "  X form ", requirement: "maybe", page: "3", quote: "" }, { name: "" }, null] });
    expect(reqs).toEqual([{ docType: "other", name: "X form", requirement: "required", condition: null, page: null, quote: null }]);
    const docs = L.toSupportingDocs({ documents: [{ docIndex: 5, docType: "iso_certificate" }, { docIndex: 1, docType: "nope", validUntil: "31/03/2027", evidence: [{ field: "bad", page: 1, quote: "x" }] }] }, 1);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ docType: "other", validUntil: null, evidence: [] });
  });
});
