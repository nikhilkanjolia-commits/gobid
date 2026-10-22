import type { AnalyzeResult, BoqLine, EligibilityRow } from "@/lib/schema";

export function inr(n: number | null | undefined) {
  if (n == null) return "—";
  const paise = Number.isInteger(n) ? 0 : 2;
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: paise, maximumFractionDigits: 2 });
}

const DECISION_STYLE: Record<string, string> = {
  GO: "bg-green-50 border-green-600 text-green-900",
  "NO-GO": "bg-red-50 border-red-600 text-red-900",
  "REVIEW NEEDED": "bg-amber-50 border-amber-500 text-amber-900",
};

const RESULT_STYLE: Record<EligibilityRow["result"], string> = {
  pass: "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  unknown: "bg-amber-100 text-amber-900",
  info: "bg-gray-100 text-gray-700",
};

export function VerdictBanner({ result }: { result: AnalyzeResult }) {
  const { verdict, boq, meta } = result;
  const c = verdict.counts;
  return (
    <section className={`rounded-lg border-l-8 p-5 ${DECISION_STYLE[verdict.decision]}`}>
      <p className="text-3xl font-bold">{verdict.decision}</p>
      <p className="mt-2 text-base">{verdict.reason}</p>
      <p className="mt-3 text-sm">
        {c.fail} failed · {c.unknown} unknown · {c.pass} passed · {boq.totals.redLines} red and {boq.totals.amberLines} amber BOQ lines ·{" "}
        {meta.pageCount} pages read{meta.seconds != null ? ` in ${meta.seconds}s` : ""}
        {meta.mode === "demo" ? " · DEMO tender with pretend AI answers" : ""}
      </p>
    </section>
  );
}

export function ClauseTable({ rows }: { rows: EligibilityRow[] }) {
  return (
    <section>
      <h2 className="mb-2 text-xl font-semibold">Eligibility</h2>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2">Clause</th>
              <th className="p-2">Tender requires</th>
              <th className="p-2">Firm has</th>
              <th className="p-2">Result</th>
              <th className="p-2">Page</th>
              <th className="p-2">Exact quote from the tender</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t align-top">
                <td className="p-2 font-medium">{r.label}</td>
                <td className="p-2">{r.requirement ?? "—"}</td>
                <td className="p-2">{r.firmHas ?? "—"}</td>
                <td className="p-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${RESULT_STYLE[r.result]}`}>{r.result}</span>
                  <p className="mt-1 text-xs text-gray-700">{r.reason}</p>
                </td>
                <td className="p-2">{r.page ?? "—"}</td>
                <td className="p-2 italic text-gray-700">{r.quote ? `“${r.quote}”` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function rowTint(r: BoqLine) {
  if (r.flags.some((f) => f.level === "red")) return "bg-red-50";
  if (r.flags.length) return "bg-amber-50";
  return "";
}

export function BoqTable({ boq, onDownload }: { boq: AnalyzeResult["boq"]; onDownload: () => void }) {
  const t = boq.totals;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Priced BOQ</h2>
        <button onClick={onDownload} className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
          Download .xlsx
        </button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Cost total" value={inr(t.costTotal)} />
        <Stat label="Bid total" value={inr(t.bidTotal)} />
        <Stat label="Margin" value={t.marginPct == null ? "—" : `${t.marginPct}%`} />
        <Stat label="Lines priced" value={`${t.pricedLines} of ${t.totalLines}`} />
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2">Item</th>
              <th className="p-2">Tender description</th>
              <th className="p-2">Matched SKU</th>
              <th className="p-2 text-right">Conf.</th>
              <th className="p-2 text-right">List</th>
              <th className="p-2 text-right">Disc.</th>
              <th className="p-2 text-right">Unit cost</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-right">Bid rate</th>
              <th className="p-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {boq.rows.map((r) => (
              <tr key={r.item} className={`border-t align-top ${rowTint(r)}`}>
                <td className="p-2">{r.item}</td>
                <td className="p-2">
                  {r.description}
                  <span className="block text-xs text-gray-500">
                    {r.unit ?? "?"}
                    {r.page != null ? ` · p. ${r.page}` : ""}
                  </span>
                </td>
                <td className="p-2">
                  {r.sku ?? "—"}
                  {r.skuDescription && <span className="block text-xs text-gray-500">{r.skuDescription}</span>}
                </td>
                <td className="p-2 text-right">{r.confidence == null ? "—" : r.confidence.toFixed(2)}</td>
                <td className="p-2 text-right">{inr(r.listPrice)}</td>
                <td className="p-2 text-right">{r.discountPct == null ? "—" : `${r.discountPct}%`}</td>
                <td className="p-2 text-right">{inr(r.unitCost)}</td>
                <td className="p-2 text-right">{r.qty ?? "—"}</td>
                <td className="p-2 text-right">{inr(r.costAmount)}</td>
                <td className="p-2 text-right">{inr(r.bidRate)}</td>
                <td className="p-2 text-xs">
                  {r.flags.map((f, i) => (
                    <p key={i} className={f.level === "red" ? "text-red-700" : "text-amber-800"}>
                      {f.level === "red" ? "🔴" : "🟡"} {f.text}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
