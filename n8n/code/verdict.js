// Turns the eligibility results and the priced BOQ into GO / NO-GO / REVIEW NEEDED, with a
// reason sentence built from the actual blockers (no AI involved).
//   any fail, or margin below the firm's minimum      → NO-GO
//   else any unknown, red line, or unpriced line      → REVIEW NEEDED
//   else                                              → GO

function pageRef(r) {
  return r.page != null ? " (p. " + r.page + ")" : "";
}

function rupees(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// eligibility: rows from evaluateEligibility. boq: { rows, totals } from priceBoq.
// firm: { minMarginPct }.
function decide(eligibility, boq, firm) {
  const rows = eligibility || [];
  const totals = (boq && boq.totals) || { pricedLines: 0, totalLines: 0, unpricedLines: 0, redLines: 0, amberLines: 0, marginPct: null };
  const fails = rows.filter((r) => r.result === "fail");
  const unknowns = rows.filter((r) => r.result === "unknown");
  const lowMargin = totals.marginPct != null && typeof firm.minMarginPct === "number" && totals.marginPct < firm.minMarginPct;

  const counts = {
    fail: fails.length,
    unknown: unknowns.length,
    pass: rows.filter((r) => r.result === "pass").length,
    redLines: totals.redLines,
    amberLines: totals.amberLines,
    unpricedLines: totals.unpricedLines,
  };

  const blockers = [];
  for (const r of fails) blockers.push(r.label + ": " + r.reason + pageRef(r));
  if (lowMargin) blockers.push("Margin " + totals.marginPct + "% is below your minimum of " + firm.minMarginPct + "%");
  if (blockers.length) {
    return { decision: "NO-GO", reason: "NO-GO. " + blockers.join("; ") + ".", blockers: blockers, counts: counts };
  }

  const reviews = [];
  for (const r of unknowns) reviews.push(r.label + ": " + r.reason + pageRef(r));
  if (totals.totalLines === 0) reviews.push("No BOQ lines were found");
  if (totals.redLines) reviews.push(totals.redLines + " BOQ line(s) flagged red");
  if (totals.unpricedLines) reviews.push(totals.unpricedLines + " BOQ line(s) could not be priced");
  if (reviews.length) {
    return { decision: "REVIEW NEEDED", reason: "Review needed before deciding. " + reviews.join("; ") + ".", blockers: reviews, counts: counts };
  }

  return {
    decision: "GO",
    reason: "GO. All " + counts.pass + " eligibility checks passed; " + totals.pricedLines + " BOQ lines priced at " +
      rupees(totals.bidTotal) + " with " + totals.marginPct + "% margin" +
      (totals.amberLines ? " (" + totals.amberLines + " line(s) worth a second look)" : "") + ".",
    blockers: [],
    counts: counts,
  };
}
