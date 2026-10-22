import type { AnalyzeResult } from "./schema";

const OEM_STATUS: Record<string, string> = {
  not_required: "Not required",
  missing: "Missing",
  verified: "Verified",
  needs_review: "Needs review",
  conflict: "Doesn't match the tender",
};

// Builds the report spreadsheet in the browser and starts the download: priced BOQ, bid
// readiness and technical compliance sheets.
export async function downloadBoqXlsx(result: AnalyzeResult, fileName = "gobid-priced-boq.xlsx") {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Priced BOQ");

  ws.columns = [
    { header: "Item", key: "item", width: 7 },
    { header: "Tender description", key: "description", width: 48 },
    { header: "Unit", key: "unit", width: 7 },
    { header: "Qty", key: "qty", width: 9 },
    { header: "Matched SKU", key: "sku", width: 18 },
    { header: "SKU description", key: "skuDescription", width: 36 },
    { header: "Brand", key: "brand", width: 12 },
    { header: "Confidence", key: "confidence", width: 11 },
    { header: "List price (₹)", key: "listPrice", width: 13 },
    { header: "Discount %", key: "discountPct", width: 11 },
    { header: "Unit cost (₹)", key: "unitCost", width: 13 },
    { header: "Cost amount (₹)", key: "costAmount", width: 15 },
    { header: "Bid rate (₹)", key: "bidRate", width: 13 },
    { header: "Bid amount (₹)", key: "bidAmount", width: 15 },
    { header: "Page", key: "page", width: 6 },
    { header: "Flags (review these)", key: "flags", width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of result.boq.rows) {
    const row = ws.addRow({
      ...r,
      flags: r.flags.map((f) => `${f.level === "red" ? "RED" : "AMBER"}: ${f.text}`).join(" | "),
    });
    const level = r.flags.some((f) => f.level === "red") ? "FFFDE2E2" : r.flags.length ? "FFFEF3C7" : null;
    if (level) row.getCell("flags").fill = { type: "pattern", pattern: "solid", fgColor: { argb: level } };
  }
  for (const key of ["listPrice", "unitCost", "costAmount", "bidRate", "bidAmount"]) ws.getColumn(key).numFmt = "#,##0.00";

  const t = result.boq.totals;
  ws.addRow([]);
  const totals = [
    ["Cost total (₹)", t.costTotal],
    ["Bid total (₹)", t.bidTotal],
    ["Margin %", t.marginPct ?? "—"],
    ["Lines priced", `${t.pricedLines} of ${t.totalLines}`],
    ["Verdict", `${result.verdict.decision}: ${result.verdict.reason}`],
  ];
  for (const [label, value] of totals) {
    const row = ws.addRow({ description: label, costAmount: value });
    row.font = { bold: true };
  }

  // Bid readiness: status, prioritized actions and the document checklist with tender evidence.
  const r = result.readiness;
  const rs = wb.addWorksheet("Bid readiness");
  rs.columns = [
    { key: "a", width: 26 },
    { key: "b", width: 22 },
    { key: "c", width: 16 },
    { key: "d", width: 60 },
    { key: "e", width: 8 },
    { key: "f", width: 70 },
  ];
  rs.addRow(["Status", r.summary.status]).font = { bold: true };
  rs.addRow(["Checks", `${r.summary.counts.passed} passed, ${r.summary.counts.failed} failed, ${r.summary.counts.review} need review`]);
  rs.addRow(["Note", "Calculated by fixed rules; a human must verify, sign and submit."]);
  rs.addRow([]);
  rs.addRow(["Priority", "Area", "", "Action", "Page", "Tender quote"]).font = { bold: true };
  for (const a of r.summary.actions) {
    rs.addRow([a.priority === 1 ? "Blocking" : a.priority === 2 ? "Check" : "Review", a.area, "", a.text, a.page ?? "", a.quote ?? ""]);
  }
  rs.addRow([]);
  rs.addRow(["Document", "Requirement", "Status", "Reason / next action", "Page", "Tender quote"]).font = { bold: true };
  for (const d of r.documents) {
    rs.addRow([d.name, d.requirement, d.status, [d.reason, d.action].filter(Boolean).join(" Next: "), d.page ?? "", d.quote ?? ""]);
  }
  rs.addRow([]);
  rs.addRow(["OEM authorization", OEM_STATUS[r.oem.status] ?? r.oem.status, "", r.oem.reason, r.oem.page ?? "", r.oem.quote ?? ""]).font = { bold: true };
  for (const f of r.oem.fields) rs.addRow([f.field, f.tender ?? "", f.result, `Letter: ${f.letter ?? "—"}${f.note ? `. ${f.note}` : ""}`]);

  // Technical compliance: one row per BOQ line and parameter.
  const tc = wb.addWorksheet("Technical compliance");
  tc.columns = [
    { header: "Item", key: "item", width: 7 },
    { header: "Tender description", key: "description", width: 46 },
    { header: "Matched SKU", key: "sku", width: 18 },
    { header: "Line status", key: "status", width: 14 },
    { header: "Parameter", key: "parameter", width: 18 },
    { header: "Tender requires", key: "required", width: 16 },
    { header: "Product value", key: "product", width: 16 },
    { header: "Result", key: "result", width: 10 },
    { header: "Note / reason", key: "note", width: 50 },
    { header: "Confidence", key: "confidence", width: 11 },
  ];
  tc.getRow(1).font = { bold: true };
  for (const c of r.compliance) {
    if (!c.params.length) tc.addRow({ ...c, note: c.reason });
    for (const p of c.params) tc.addRow({ item: c.item, description: c.description, sku: c.sku, status: c.status, ...p, note: p.note ?? c.reason, confidence: c.confidence });
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
