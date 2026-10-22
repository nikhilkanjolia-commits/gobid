import { inr } from "@/components/Results";
import type { ComplianceRowT, DocumentRowT, ReadinessResult } from "@/lib/schema";

const STATUS_STYLE: Record<string, string> = {
  "Ready for human review": "border-green-600 bg-green-50 text-green-900",
  "Review required": "border-amber-500 bg-amber-50 text-amber-900",
  "Potential disqualification": "border-red-600 bg-red-50 text-red-900",
};

const BADGE: Record<string, string> = {
  Verified: "bg-green-100 text-green-800",
  Compliant: "bg-green-100 text-green-800",
  match: "bg-green-100 text-green-800",
  verified: "bg-green-100 text-green-800",
  Missing: "bg-red-100 text-red-800",
  Expired: "bg-red-100 text-red-800",
  "Not compliant": "bg-red-100 text-red-800",
  mismatch: "bg-red-100 text-red-800",
  conflict: "bg-red-100 text-red-800",
  missing: "bg-red-100 text-red-800",
  "Needs review": "bg-amber-100 text-amber-900",
  needs_review: "bg-amber-100 text-amber-900",
  review: "bg-amber-100 text-amber-900",
  unknown: "bg-amber-100 text-amber-900",
  "Not applicable": "bg-gray-100 text-gray-700",
  not_required: "bg-gray-100 text-gray-700",
  info: "bg-gray-100 text-gray-700",
};

const OEM_LABEL: Record<string, string> = {
  not_required: "Not required",
  missing: "Missing",
  verified: "Verified",
  needs_review: "Needs review",
  conflict: "Doesn't match the tender",
};

function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold ${BADGE[value] ?? "bg-gray-100 text-gray-700"}`}>{label ?? value}</span>;
}

// The tender evidence behind a requirement: page and exact quote, or a clear "unavailable".
function Evidence({ page, quote }: { page: number | null; quote: string | null }) {
  if (page == null || !quote) return <p className="text-sm text-gray-600">Evidence unavailable: no verified page and quote for this requirement.</p>;
  return (
    <blockquote className="border-l-4 border-gray-300 pl-3 text-sm italic text-gray-700">
      “{quote}” <span className="not-italic text-gray-500">— tender page {page}</span>
    </blockquote>
  );
}

function DocumentRow({ d }: { d: DocumentRowT }) {
  return (
    <details className="group border-t">
      <summary className="grid cursor-pointer grid-cols-[1fr_auto] gap-2 p-3 hover:bg-gray-50 sm:grid-cols-[2fr_1fr_auto_3rem]">
        <span className="font-medium">
          {d.name}
          <span className="block text-xs font-normal text-gray-500">{d.reason}</span>
        </span>
        <span className="hidden text-sm text-gray-600 sm:block">{d.requirement === "conditional" ? `Conditional${d.condition ? `: ${d.condition}` : ""}` : d.requirement === "required" ? "Required" : "Not established"}</span>
        <Badge value={d.status} />
        <span className="hidden text-right text-sm text-gray-600 sm:block">{d.page != null ? `p. ${d.page}` : "—"}</span>
      </summary>
      <div className="space-y-2 bg-gray-50 px-3 pb-3 pt-1">
        <Evidence page={d.page} quote={d.quote} />
        {d.evidence && <p className="text-sm text-gray-700">Checked against: {d.evidence}</p>}
        {d.action && <p className="text-sm font-medium text-blue-900">Next: {d.action}</p>}
      </div>
    </details>
  );
}

function ComplianceRow({ c }: { c: ComplianceRowT }) {
  return (
    <details className="border-t">
      <summary className="grid cursor-pointer grid-cols-[3rem_1fr_auto] gap-2 p-3 hover:bg-gray-50">
        <span className="text-sm text-gray-600">{c.item}</span>
        <span className="text-sm">
          {c.description}
          <span className="block text-xs text-gray-500">
            {c.sku ? `${c.sku} — ${c.skuDescription}` : "No product matched"}
            {c.confidence != null ? ` · AI match confidence ${c.confidence.toFixed(2)}` : ""}
          </span>
        </span>
        <Badge value={c.status} />
      </summary>
      <div className="overflow-x-auto bg-gray-50 px-3 pb-3 pt-1">
        <p className="mb-2 text-sm text-gray-700">{c.reason}</p>
        {c.params.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="text-gray-600">
              <tr>
                <th className="py-1 pr-3">Parameter</th>
                <th className="py-1 pr-3">Tender requires{c.page != null ? ` (p. ${c.page})` : ""}</th>
                <th className="py-1 pr-3">Product{c.source ? ` (${c.source})` : ""}</th>
                <th className="py-1 pr-3">Result</th>
                <th className="py-1">Note</th>
              </tr>
            </thead>
            <tbody>
              {c.params.map((p) => (
                <tr key={p.parameter} className="border-t">
                  <td className="py-1 pr-3">{p.parameter}</td>
                  <td className="py-1 pr-3">{p.required}</td>
                  <td className="py-1 pr-3">{p.product ?? "—"}</td>
                  <td className="py-1 pr-3">
                    <Badge value={p.result} />
                  </td>
                  <td className="py-1 text-gray-600">{p.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-600">No comparable parameters were found in the tender line.</p>
        )}
      </div>
    </details>
  );
}

export function BidReadiness({ readiness }: { readiness: ReadinessResult }) {
  const s = readiness.summary;
  const oem = readiness.oem;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Bid Readiness</h2>

      <div className={`rounded-lg border-l-8 p-5 ${STATUS_STYLE[s.status]}`}>
        <p className="text-2xl font-bold">{s.status}</p>
        <p className="mt-1 text-sm">
          {s.counts.passed} checks passed · {s.counts.failed} failed · {s.counts.review} need review
          {s.boqTotal != null ? ` · BOQ bid total ${inr(s.boqTotal)}` : ""}
          {s.marginPct != null ? ` · margin ${s.marginPct}%` : ""}
          {readiness.tenderReference ? ` · ${readiness.tenderReference}` : ""}
        </p>
        <p className="mt-2 text-xs">
          Calculated by fixed rules from the checks below — not by the AI. &quot;Ready for human review&quot; means no blocking issue was found, not that the bid is eligible or will win.
        </p>
      </div>

      {(s.criticalDocuments.length > 0 || s.technicalMismatches.length > 0 || s.unverifiedClauses.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Critical missing documents", s.criticalDocuments],
            ["Technical mismatches", s.technicalMismatches],
            ["Unverified eligibility clauses", s.unverifiedClauses],
          ].map(([title, list]) => (
            <div key={title as string} className="rounded-lg border bg-white p-3">
              <h3 className="text-sm font-semibold">
                {title} ({(list as string[]).length})
              </h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
                {(list as string[]).slice(0, 6).map((x) => (
                  <li key={x}>{x}</li>
                ))}
                {(list as string[]).length === 0 && <li className="list-none text-gray-500">None</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-white">
        <h3 className="border-b p-3 font-semibold">Action list ({s.actions.length})</h3>
        {s.actions.length === 0 && <p className="p-3 text-sm text-gray-600">No open actions. Do a final human review before submitting.</p>}
        <ol>
          {s.actions.map((a, i) => (
            <li key={i} className="border-t first:border-t-0">
              <details>
                <summary className="flex cursor-pointer gap-3 p-3 text-sm hover:bg-gray-50">
                  <span className={`w-20 shrink-0 font-semibold ${a.priority === 1 ? "text-red-700" : a.priority === 2 ? "text-amber-800" : "text-gray-700"}`}>
                    {a.priority === 1 ? "Blocking" : a.priority === 2 ? "Check" : "Review"}
                  </span>
                  <span className="w-28 shrink-0 text-gray-500">{a.area}</span>
                  <span className="flex-1">{a.text}</span>
                  <span className="shrink-0 text-gray-500">{a.page != null ? `p. ${a.page}` : ""}</span>
                </summary>
                <div className="bg-gray-50 px-3 pb-3">
                  <Evidence page={a.page} quote={a.quote} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg border bg-white">
        <h3 className="border-b p-3 font-semibold">Document checklist ({readiness.documents.length})</h3>
        {readiness.documents.length === 0 ? (
          <p className="p-3 text-sm text-gray-600">No document requirements were found in the tender with a verified quote. Check the tender&apos;s document list yourself.</p>
        ) : (
          readiness.documents.map((d, i) => <DocumentRow key={i} d={d} />)
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">OEM authorization check</h3>
          <Badge value={oem.status} label={OEM_LABEL[oem.status]} />
          <span className="text-sm text-gray-600">Tender: {oem.requirement}{oem.condition ? ` (${oem.condition})` : ""}{oem.letterFile ? ` · Letter: ${oem.letterFile}` : ""}</span>
        </div>
        <p className="mt-2 text-sm">{oem.reason}</p>
        {oem.status !== "not_required" && (
          <div className="mt-2">
            <Evidence page={oem.page} quote={oem.quote} />
          </div>
        )}
        {oem.fields.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-gray-600">
                <tr>
                  <th className="py-1 pr-3">Field</th>
                  <th className="py-1 pr-3">Tender / your firm</th>
                  <th className="py-1 pr-3">Letter says</th>
                  <th className="py-1 pr-3">Result</th>
                  <th className="py-1">Note</th>
                </tr>
              </thead>
              <tbody>
                {oem.fields.map((f) => (
                  <tr key={f.field} className="border-t">
                    <td className="py-1 pr-3 font-medium">{f.field}</td>
                    <td className="py-1 pr-3">{f.tender ?? "—"}</td>
                    <td className="py-1 pr-3">{f.letter ?? "—"}</td>
                    <td className="py-1 pr-3">
                      <Badge value={f.result} />
                    </td>
                    <td className="py-1 text-gray-600">{f.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">GoBid only compares an uploaded letter with the tender. It never creates authorizations or confirms that an OEM has approved you.</p>
      </div>

      <div className="rounded-lg border bg-white">
        <h3 className="border-b p-3 font-semibold">
          Technical compliance matrix ({readiness.compliance.filter((c) => c.status === "Compliant").length} of {readiness.compliance.length} compliant)
        </h3>
        {readiness.compliance.map((c) => (
          <ComplianceRow key={c.item} c={c} />
        ))}
        <p className="border-t p-3 text-xs text-gray-500">
          Parameters are read from the tender line and the matched catalogue entry and compared by fixed rules. A similar product is not treated as compliant: any
          critical mismatch fails the line, and a parameter missing from the catalogue needs review.
        </p>
      </div>

      {readiness.supportingDocs.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="font-semibold">Supporting documents read</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {readiness.supportingDocs.map((d) => (
              <li key={d.fileName}>
                <span className="font-medium">{d.fileName}</span>{" "}
                {d.problem ? (
                  <span className="text-amber-800">— {d.problem}</span>
                ) : (
                  <span className="text-gray-700">
                    — {d.title ?? d.docType}. Verified fields: {Object.keys(d.fields).join(", ") || "none"}
                    {d.unverifiedFields.length ? `. Not verifiable from its text: ${d.unverifiedFields.join(", ")}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
