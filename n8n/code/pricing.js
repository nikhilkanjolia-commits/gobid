// Prices the checked BOQ. All money is worked out in whole paise (₹1 = 100 paise) so totals
// add up exactly, then shown in rupees.
//   unit cost = list price × (1 − discount)
//   amount    = qty × unit cost
//   bid rate  = unit cost × (1 + markup)
//   margin %  = (bid total − cost total) ÷ bid total
// Only lines with status "ok" are priced; the rest stay listed with their flags.

function toPaise(rupees) {
  return Math.round(rupees * 100);
}

function toRupees(paise) {
  return paise / 100;
}

// rows: output of checkMatches. firm: { markupPct }.
function priceBoq(rows, firm) {
  const markup = typeof firm.markupPct === "number" ? firm.markupPct : 0;
  let costTotal = 0;
  let bidTotal = 0;
  let priced = 0;

  const out = (rows || []).map((r) => {
    const line = Object.assign({}, r, { unitCost: null, costAmount: null, bidRate: null, bidAmount: null });
    if (r.status !== "ok") return line;
    const unitCost = Math.round((toPaise(r.listPrice) * (100 - r.discountPct)) / 100);
    const costAmount = Math.round(unitCost * r.qty);
    const bidRate = Math.round((unitCost * (100 + markup)) / 100);
    const bidAmount = Math.round(bidRate * r.qty);
    costTotal += costAmount;
    bidTotal += bidAmount;
    priced++;
    line.unitCost = toRupees(unitCost);
    line.costAmount = toRupees(costAmount);
    line.bidRate = toRupees(bidRate);
    line.bidAmount = toRupees(bidAmount);
    return line;
  });

  const count = (fn) => out.filter(fn).length;
  return {
    rows: out,
    totals: {
      costTotal: toRupees(costTotal),
      bidTotal: toRupees(bidTotal),
      marginPct: bidTotal > 0 ? Math.round(((bidTotal - costTotal) / bidTotal) * 10000) / 100 : null,
      pricedLines: priced,
      totalLines: out.length,
      unpricedLines: out.length - priced,
      redLines: count((r) => r.flags.some((f) => f.level === "red")),
      amberLines: count((r) => r.flags.some((f) => f.level === "amber") && !r.flags.some((f) => f.level === "red")),
    },
  };
}
