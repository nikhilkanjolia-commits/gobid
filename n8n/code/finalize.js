// Ties the plain-code steps together once the AI has answered. Uses functions from
// verifyQuotes.js, rules.js, matchChecks.js, pricing.js, verdict.js and readiness.js, so the
// n8n "Decide" node contains those files followed by this one.

// BOQ item numbers can repeat across sections ("1" under each heading); make them unique
// so every line keeps its own SKU match.
function uniqueItems(rows) {
  const seen = new Map();
  return (rows || []).map((r) => {
    const base = String(r.item == null || r.item === "" ? "?" : r.item).trim();
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return Object.assign({}, r, { item: n === 1 ? base : base + " (" + n + ")" });
  });
}

// input: { pages, clauses, boqRows, matches, priceRows, firm, today,
//          docRequirements?, supportingFiles?, supportingAi? }
function finalizeResult(input) {
  const clauses = verifyQuotes(input.pages, input.clauses || []);
  const eligibility = evaluateEligibility(clauses, input.firm, input.today);
  const approvedGroups = clauses
    .filter((c) => c.type === "approved_makes" && c.verified)
    .flatMap((c) => (c.values && c.values.items) || []);
  // Verify each BOQ line is on its page, then read its printed unit and quantity in code.
  const boqRows = readBoqLines(input.pages, verifyQuotes(input.pages, input.boqRows || []));
  const checked = checkMatches(boqRows, input.matches || [], input.priceRows, approvedGroups);
  const boq = priceBoq(checked, input.firm);
  const verdict = decide(eligibility, boq, input.firm);

  // Bid Readiness: documents, OEM authorization, technical compliance, overall status.
  const docRequirements = verifyQuotes(input.pages, input.docRequirements || []);
  const supportingDocs = checkSupportingDocs(input.supportingFiles || [], input.supportingAi || []);
  const oem = checkOemAuthorization({
    clauses: clauses,
    docRequirements: docRequirements,
    supportingDocs: supportingDocs,
    firm: input.firm,
    today: input.today,
    tenderRef: tenderReference(input.pages),
    boqDescriptions: boqRows.map((r) => r.description),
  });
  const documents = evaluateDocuments({ docRequirements: docRequirements, supportingDocs: supportingDocs, firm: input.firm, today: input.today, oem: oem });
  const compliance = technicalCompliance(checked, input.priceRows);
  const summary = computeReadiness({ eligibility: eligibility, documents: documents, oem: oem, compliance: compliance, boqTotals: boq.totals });

  return {
    verdict: verdict,
    eligibility: eligibility,
    boq: boq,
    readiness: {
      summary: summary,
      documents: documents,
      oem: oem,
      compliance: compliance,
      supportingDocs: supportingDocs.map((d) => ({ fileName: d.fileName, readable: d.readable, docType: d.docType, title: d.title, problem: d.problem, fields: d.fields, unverifiedFields: d.unverifiedFields })),
      tenderReference: tenderReference(input.pages),
    },
    meta: { pageCount: input.pages.length, firmName: input.firm.name || null },
  };
}
