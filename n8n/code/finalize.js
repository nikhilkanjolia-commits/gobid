// Ties the plain-code steps together once the AI has answered. Uses functions from
// verifyQuotes.js, rules.js, matchChecks.js, pricing.js and verdict.js, so the n8n
// "Decide" node contains those files followed by this one.

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

// input: { pages, clauses, boqRows, matches, priceRows, firm, today }
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
  return {
    verdict: decide(eligibility, boq, input.firm),
    eligibility: eligibility,
    boq: boq,
    meta: { pageCount: input.pages.length, firmName: input.firm.name || null },
  };
}
