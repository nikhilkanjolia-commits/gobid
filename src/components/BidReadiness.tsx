import type { ReactNode } from "react";
import { Evidence } from "@/components/Results";
import { Icon, StatusBadge, Term, card, type Tone } from "@/components/ui";
import { inr } from "@/lib/format";
import type { ComplianceRowT, DocumentRowT, ReadinessResult } from "@/lib/schema";

const STATUS: Record<string, { tone: Tone; panel: string; text: string }> = {
  "Ready for human review": { tone: "good", panel: "border-emerald-200 bg-emerald-50", text: "text-emerald-800" },
  "Review required": { tone: "warn", panel: "border-amber-200 bg-amber-50", text: "text-amber-900" },
  "Potential disqualification": { tone: "bad", panel: "border-red-200 bg-red-50", text: "text-red-800" },
};

// Every status the readiness checks can return, mapped to a tone (colour + icon).
const TONE: Record<string, Tone> = {
  Verified: "good",
  Compliant: "good",
  match: "good",
  verified: "good",
  Missing: "bad",
  Expired: "bad",
  "Not compliant": "bad",
  mismatch: "bad",
  conflict: "bad",
  missing: "bad",
  "Needs review": "warn",
  needs_review: "warn",
  review: "warn",
  unknown: "warn",
  "Not applicable": "neutral",
  not_required: "neutral",
  info: "neutral",
};

const LABEL: Record<string, string> = {
  not_required: "Not required",
  missing: "Missing",
  verified: "Verified",
  needs_review: "Needs review",
  conflict: "Doesn't match the tender",
  match: "Match",
  mismatch: "Mismatch",
  review: "Review",
  unknown: "Unknown",
  info: "Info",
};

function Badge({ value }: { value: string }) {
  return <StatusBadge tone={TONE[value] ?? "neutral"}>{LABEL[value] ?? value}</StatusBadge>;
}

const PRIORITY: Record<number, { label: string; tone: Tone }> = {
  1: { label: "Blocking", tone: "bad" },
  2: { label: "Check", tone: "warn" },
  3: { label: "Review", tone: "neutral" },
};

function Chevron() {
  return <Icon name="chevronDown" className="chevron h-4 w-4 shrink-0 text-slate-400 transition-transform" />;
}

function Panel({ id, title, sub, children }: { id?: string; title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className={card}>
      <div className="border-b border-slate-200 px-5 py-3.5 sm:px-6">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function DocumentRow({ d }: { d: DocumentRowT }) {
  const req = d.requirement === "conditional" ? `Conditional${d.condition ? `: ${d.condition}` : ""}` : d.requirement === "required" ? "Required" : "Not established";
  return (
    <details className="group border-t border-slate-100 first:border-t-0">
      <summary className="grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:grid-cols-[2fr_1.2fr_auto_3.5rem_auto] sm:px-6">
        <span className="min-w-0">
          <span className="font-medium text-slate-900">{d.name}</span>
          <span className="block text-xs text-slate-500">{d.reason}</span>
        </span>
        <span className="hidden text-sm text-slate-600 sm:block">{req}</span>
        <Badge value={d.status} />
        <span className="hidden text-right text-xs tabular-nums text-slate-500 sm:block">{d.page != null ? `p. ${d.page}` : "—"}</span>
        <Chevron />
      </summary>
      <div className="space-y-2 bg-slate-50 px-5 pb-4 pt-2 sm:px-6">
        <Evidence page={d.page} quote={d.quote} />
        {d.evidence && <p className="text-sm text-slate-700">Checked against: {d.evidence}</p>}
        {d.action && (
          <p className="flex items-start gap-2 text-sm font-medium text-blue-800">
            <Icon name="arrowRight" className="mt-0.5 h-4 w-4 shrink-0" />
            {d.action}
          </p>
        )}
      </div>
    </details>
  );
}

function ComplianceRow({ c }: { c: ComplianceRowT }) {
  return (
    <details className="border-t border-slate-100 first:border-t-0">
      <summary className="grid cursor-pointer grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-6">
        <span className="text-sm text-slate-500">{c.item}</span>
        <span className="min-w-0 text-sm">
          <span className="text-slate-900">{c.description}</span>
          <span className="block text-xs text-slate-500">
            {c.sku ? `${c.sku} — ${c.skuDescription}` : "No product matched"}
            {c.confidence != null ? ` · match confidence ${c.confidence.toFixed(2)}` : ""}
          </span>
        </span>
        <Badge value={c.status} />
        <Chevron />
      </summary>
      <div className="overflow-x-auto bg-slate-50 px-5 pb-4 pt-2 sm:px-6">
        <p className="mb-2 text-sm text-slate-700">{c.reason}</p>
        {c.params.length > 0 ? (
          <table className="w-full min-w-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2">Parameter</th>
                <th scope="col" className="px-3 py-2">Tender requires{c.page != null ? ` (p. ${c.page})` : ""}</th>
                <th scope="col" className="px-3 py-2">Product{c.source ? ` (${c.source})` : ""}</th>
                <th scope="col" className="px-3 py-2">Result</th>
                <th scope="col" className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {c.params.map((p) => (
                <tr key={p.parameter}>
                  <td className="px-3 py-2 font-medium text-slate-800">{p.parameter === "kA" ? <Term t="kA" /> : p.parameter}</td>
                  <td className="px-3 py-2">{p.required}</td>
                  <td className="px-3 py-2">{p.product ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge value={p.result} />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{p.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-600">No comparable parameters were found in the tender line.</p>
        )}
      </div>
    </details>
  );
}

export function BidReadiness({ readiness }: { readiness: ReadinessResult }) {
  const s = readiness.summary;
  const oem = readiness.oem;
  const st = STATUS[s.status];
  const compliant = readiness.compliance.filter((c) => c.status === "Compliant").length;
  return (
    <section id="readiness" className="space-y-4" aria-labelledby="readiness-title">
      <div className={`rounded-xl border p-5 sm:p-6 ${st.panel}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="readiness-title" className="text-base font-semibold text-slate-900">
            Bid readiness
          </h2>
          <StatusBadge tone={st.tone}>{s.status}</StatusBadge>
        </div>
        <p className={`mt-2 text-sm ${st.text}`}>
          {s.counts.passed} checks passed · {s.counts.failed} failed · {s.counts.review} need review
          {s.boqTotal != null ? ` · BOQ bid value ${inr(s.boqTotal)}` : ""}
          {s.marginPct != null ? ` · margin ${s.marginPct}%` : ""}
          {readiness.tenderReference ? ` · ${readiness.tenderReference}` : ""}
        </p>
        <p className="mt-2 flex items-start gap-2 text-xs text-slate-600">
          <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Calculated by fixed rules from the checks below, not by the AI. &quot;Ready for human review&quot; means no blocking issue was found, not that the bid is eligible or will win.
        </p>
      </div>

      {(s.criticalDocuments.length > 0 || s.technicalMismatches.length > 0 || s.unverifiedClauses.length > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          {(
            [
              ["Critical missing documents", s.criticalDocuments, "bad"],
              ["Technical mismatches", s.technicalMismatches, "bad"],
              ["Unverified eligibility clauses", s.unverifiedClauses, "warn"],
            ] as const
          ).map(([title, list, tone]) => (
            <div key={title} className={`${card} p-4`}>
              <h3 className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                {title}
                <StatusBadge tone={list.length ? tone : "good"}>{list.length}</StatusBadge>
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {list.slice(0, 6).map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                    {x}
                  </li>
                ))}
                {list.length > 6 && <li className="text-xs text-slate-500">+ {list.length - 6} more below</li>}
                {list.length === 0 && <li className="text-slate-500">None found</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Panel title={`Action list (${s.actions.length})`} sub="Blocking items first. Open one to see the evidence.">
        {s.actions.length === 0 && <p className="px-5 py-4 text-sm text-slate-600 sm:px-6">No open actions. Do a final human review before submitting.</p>}
        <ol>
          {s.actions.map((a, i) => {
            const p = PRIORITY[a.priority] ?? PRIORITY[3];
            return (
              <li key={i} className="border-t border-slate-100 first:border-t-0">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:flex-nowrap sm:px-6">
                    <span className="w-24 shrink-0">
                      <StatusBadge tone={p.tone}>{p.label}</StatusBadge>
                    </span>
                    <span className="w-28 shrink-0 text-xs text-slate-500">{a.area}</span>
                    <span className="min-w-0 flex-1 basis-full text-slate-900 sm:basis-auto">{a.text}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{a.page != null ? `p. ${a.page}` : ""}</span>
                    <Chevron />
                  </summary>
                  <div className="bg-slate-50 px-5 pb-4 pt-2 sm:px-6">
                    <Evidence page={a.page} quote={a.quote} />
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel title={`Document checklist (${readiness.documents.length})`} sub="Every document the tender asks for, checked against your uploaded documents and firm profile.">
        {readiness.documents.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-600 sm:px-6">No document requirements were found in the tender with a verified quote. Check the tender&apos;s document list yourself.</p>
        ) : (
          readiness.documents.map((d, i) => <DocumentRow key={i} d={d} />)
        )}
      </Panel>

      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Term t="OEM">OEM</Term> authorization check
            <Badge value={oem.status} />
          </span>
        }
        sub={
          <>
            Tender: {oem.requirement}
            {oem.condition ? ` (${oem.condition})` : ""}
            {oem.letterFile ? ` · Letter: ${oem.letterFile}` : ""}
          </>
        }
      >
        <div className="space-y-3 px-5 py-4 sm:px-6">
          <p className="text-sm text-slate-800">{oem.reason}</p>
          {oem.status !== "not_required" && <Evidence page={oem.page} quote={oem.quote} />}
          {oem.fields.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Field</th>
                    <th scope="col" className="py-2 pr-3">Tender / your firm</th>
                    <th scope="col" className="py-2 pr-3">Letter says</th>
                    <th scope="col" className="py-2 pr-3">Result</th>
                    <th scope="col" className="py-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {oem.fields.map((f) => (
                    <tr key={f.field}>
                      <td className="py-2 pr-3 font-medium text-slate-800">{f.field}</td>
                      <td className="py-2 pr-3">{f.tender ?? "—"}</td>
                      <td className="py-2 pr-3">{f.letter ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge value={f.result} />
                      </td>
                      <td className="py-2 text-slate-600">{f.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">GoBid only compares an uploaded letter with the tender. It never creates authorizations or confirms that an OEM has approved you.</p>
        </div>
      </Panel>

      <Panel
        title={`Technical compliance matrix (${compliant} of ${readiness.compliance.length} compliant)`}
        sub="Rating, poles, kA, cores, size and voltage from the tender line compared with the matched product."
      >
        {readiness.compliance.length === 0 && <p className="px-5 py-4 text-sm text-slate-600 sm:px-6">No BOQ lines to compare.</p>}
        {readiness.compliance.map((c) => (
          <ComplianceRow key={c.item} c={c} />
        ))}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
          A similar product is not treated as compliant: any critical mismatch fails the line, and a parameter missing from the catalogue needs review.
        </p>
      </Panel>

      {readiness.supportingDocs.length > 0 && (
        <Panel title="Supporting documents read">
          <ul className="divide-y divide-slate-100 text-sm">
            {readiness.supportingDocs.map((d) => (
              <li key={d.fileName} className="flex items-start gap-3 px-5 py-3 sm:px-6">
                <Icon name="file" className={`mt-0.5 h-4 w-4 shrink-0 ${d.problem ? "text-amber-600" : "text-slate-400"}`} />
                <span>
                  <span className="font-medium text-slate-900">{d.fileName}</span>
                  {d.problem ? (
                    <span className="block text-amber-800">{d.problem}</span>
                  ) : (
                    <span className="block text-slate-600">
                      {d.title ?? d.docType}. Verified fields: {Object.keys(d.fields).join(", ") || "none"}
                      {d.unverifiedFields.length ? `. Not verifiable from its text: ${d.unverifiedFields.join(", ")}` : ""}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}
