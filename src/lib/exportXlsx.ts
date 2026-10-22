import type { AnalyzeResult } from "./schema";

// Builds the priced-BOQ spreadsheet in the browser and starts the download.
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

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
