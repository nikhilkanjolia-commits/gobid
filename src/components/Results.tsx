"use client";

import { Fragment, useState } from "react";
import { Icon, StatusBadge, Term, btn, card, toneText, type Tone } from "@/components/ui";
import { inr } from "@/lib/format";
import type { AnalyzeResult, BoqLine, EligibilityRow } from "@/lib/schema";

const DECISION: Record<AnalyzeResult["verdict"]["decision"], { tone: Tone; label: string; panel: string; text: string }> = {
  GO: { tone: "good", label: "Go", panel: "border-emerald-200 bg-emerald-50", text: "text-emerald-800" },
  "NO-GO": { tone: "bad", label: "No-Go", panel: "border-red-200 bg-red-50", text: "text-red-800" },
  "REVIEW NEEDED": { tone: "warn", label: "Review needed", panel: "border-amber-200 bg-amber-50", text: "text-amber-900" },
};

const RESULT: Record<EligibilityRow["result"], { tone: Tone; label: string }> = {
  pass: { tone: "good", label: "Pass" },
  fail: { tone: "bad", label: "Fail" },
  unknown: { tone: "warn", label: "Unknown" },
  info: { tone: "neutral", label: "Info" },
};

const READINESS_TONE: Record<string, Tone> = {
  "Ready for human review": "good",
  "Review required": "warn",
  "Potential disqualification": "bad",
};

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
          .catch(() => {})
      }
      className={btn.small}
    >
      <Icon name={done ? "check" : "copy"} className="h-3.5 w-3.5" />
      {done ? "Copied" : label}
    </button>
  );
}

// The tender evidence behind a result: exact quote and page, or a clear "unavailable".
export function Evidence({ page, quote, source = "tender" }: { page: number | null; quote: string | null; source?: string }) {
  if (page == null || !quote) {
    return (
      <p className="flex items-start gap-2 text-sm text-slate-600">
        <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        Evidence unavailable: no verified page and quote for this item. Check the {source} yourself.
      </p>
    );
  }
  return (
    <figure className="rounded-lg border border-slate-200 bg-white p-3">
      <blockquote className="border-l-2 border-blue-300 pl-3 text-sm leading-relaxed text-slate-800">“{quote}”</blockquote>
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded bg-blue-50 px-1.5 py-0.5 tabular-nums font-medium text-blue-700">
          {source} p. {page}
        </span>
        <span className="ml-auto">
          <CopyButton text={`“${quote}” (${source} page ${page})`} label="Copy quote" />
        </span>
      </figcaption>
    </figure>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold tabular-nums ${tone ? toneText[tone] : "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// Top of the report: the decision, the main risk, key numbers and the Excel export.
export function ReportSummary({ result, title, onDownload }: { result: AnalyzeResult; title: string; onDownload: () => void }) {
  const { verdict, boq, meta, readiness } = result;
  const d = DECISION[verdict.decision];
  const c = verdict.counts;
  const t = boq.totals;
  const topAction = readiness.summary.actions.find((a) => a.priority === 1) ?? readiness.summary.actions[0];
  // The reason starts with the decision ("NO-GO. …"), which the panel already shows.
  const reason = verdict.reason.replace(/^(GO|NO-GO|REVIEW NEEDED)[.:]s*/, "");
  const fail = c.fail ?? 0;
  const unknown = c.unknown ?? 0;
  const eligibility: { value: string; sub: string; tone: Tone } =
    fail > 0
      ? { value: `${fail} failed`, sub: `${c.pass ?? 0} passed · ${unknown} unknown`, tone: "bad" }
      : unknown > 0
        ? { value: `${unknown} unknown`, sub: `${c.pass ?? 0} passed · none failed`, tone: "warn" }
        : { value: `${c.pass ?? 0} passed`, sub: "None failed or unknown", tone: "good" };
  return (
    <section className={`${card} overflow-hidden`} aria-labelledby="report-title">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tender analysis report</p>
          <h2 id="report-title" className="mt-1 truncate text-lg font-semibold text-slate-900" title={title}>
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {meta.pageCount} pages read{meta.seconds ? ` in ${meta.seconds}s` : ""}
            {meta.firmName ? ` · checked against ${meta.firmName}` : ""}
            {meta.mode === "demo" ? " · sample tender with saved AI answers" : ""}
          </p>
        </div>
        <button onClick={onDownload} className={btn.primary}>
          <Icon name="download" />
          Export priced BOQ (.xlsx)
        </button>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr]">
        <div className={`rounded-lg border p-4 ${d.panel}`}>
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-full bg-white ${d.text}`}>
              <Icon name={d.tone === "good" ? "check" : d.tone === "bad" ? "x" : "alert"} className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-600">Recommendation</p>
              <p className={`text-2xl font-semibold ${d.text}`}>{d.label}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-800">{reason}</p>
          {topAction && verdict.decision !== "GO" && !reason.includes(topAction.text) && (
            <p className="mt-3 flex items-start gap-2 rounded-md bg-white/70 p-2.5 text-sm text-slate-800">
              <Icon name="arrowRight" className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span>
                <span className="font-medium">First action:</span> {topAction.text}
                {topAction.page != null ? ` (p. ${topAction.page})` : ""}
              </span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Eligibility" value={eligibility.value} sub={eligibility.sub} tone={eligibility.tone} />
          <Stat label="Bid readiness" value={readiness.summary.status} sub={`${readiness.summary.actions.length} open actions`} tone={READINESS_TONE[readiness.summary.status]} />
          <Stat label="BOQ bid value" value={inr(t.bidTotal)} sub={`Cost ${inr(t.costTotal)} · ${t.pricedLines} of ${t.totalLines} lines priced`} />
          <Stat label="Estimated margin" value={t.marginPct == null ? "—" : `${t.marginPct}%`} sub={`${t.redLines} lines to fix · ${t.amberLines} to check`} />
        </div>
      </div>
    </section>
  );
}

const ORDER = { fail: 0, unknown: 1, pass: 2, info: 3 } as const;

export function ClauseTable({ rows }: { rows: EligibilityRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => ORDER[a.r.result] - ORDER[b.r.result]);
  return (
    <section id="eligibility" className={card} aria-labelledby="eligibility-title">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <h2 id="eligibility-title" className="text-base font-semibold text-slate-900">
            Eligibility checklist
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">Failed and unknown checks first. Open a row to see the exact quote from the tender.</p>
        </div>
      </header>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-2.5 sm:px-6">Requirement</th>
              <th scope="col" className="px-3 py-2.5">Status</th>
              <th scope="col" className="px-3 py-2.5">Your firm</th>
              <th scope="col" className="px-3 py-2.5">Source</th>
              <th scope="col" className="px-5 py-2.5 text-right sm:px-6" aria-label="Evidence" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map(({ r, i }) => {
              const isOpen = open === i;
              const res = RESULT[r.result];
              return (
                <Fragment key={i}>
                  <tr className={`align-top ${isOpen ? "bg-slate-50" : "hover:bg-slate-50/60"}`}>
                    <td className="px-5 py-3 sm:px-6">
                      <p className="font-medium text-slate-900">{r.label}</p>
                      <p className="mt-0.5 text-slate-600">{r.requirement ?? "Requirement not found in the tender"}</p>
                    </td>
                    <td className="max-w-64 px-3 py-3">
                      <StatusBadge tone={res.tone}>{res.label}</StatusBadge>
                      <p className="mt-1 text-xs leading-snug text-slate-600">{r.reason}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{r.firmHas ?? "—"}</td>
                    <td className="px-3 py-3">
                      {r.page != null ? <span className="rounded bg-blue-50 px-1.5 py-0.5 tabular-nums text-xs font-medium text-blue-700">p. {r.page}</span> : <span className="text-xs text-slate-400">No page</span>}
                    </td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : i)}
                        aria-expanded={isOpen}
                        aria-controls={`ev-${i}`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                      >
                        {isOpen ? "Hide" : "View"} evidence
                        <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={`ev-${i}`} className="bg-slate-50">
                      <td colSpan={5} className="px-5 pb-4 sm:px-6">
                        <Evidence page={r.page} quote={r.quote} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function lineTone(r: BoqLine): Tone {
  if (r.flags.some((f) => f.level === "red")) return "bad";
  if (r.flags.length) return "warn";
  return "good";
}

export function BoqTable({ boq, onDownload }: { boq: AnalyzeResult["boq"]; onDownload: () => void }) {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const t = boq.totals;
  const rows = flaggedOnly ? boq.rows.filter((r) => r.flags.length) : boq.rows;
  const num = "px-3 py-3 text-right tabular-nums whitespace-nowrap";
  return (
    <section id="boq" className={card} aria-labelledby="boq-title">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <h2 id="boq-title" className="text-base font-semibold text-slate-900">
            <Term t="BOQ">BOQ</Term> pricing
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">Each line matched to your supplier price lists. Lines marked Fix or Check need your review before you quote.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
            Flagged lines only ({t.redLines + t.amberLines})
          </label>
          <button onClick={onDownload} className={btn.secondary}>
            <Icon name="download" />
            Export .xlsx
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-5 sm:grid-cols-4 sm:px-6">
        <Stat label="Cost total" value={inr(t.costTotal)} />
        <Stat label="Bid value" value={inr(t.bidTotal)} />
        <Stat label="Estimated margin" value={t.marginPct == null ? "—" : `${t.marginPct}%`} />
        <Stat label="Lines priced" value={`${t.pricedLines} of ${t.totalLines}`} sub={t.unpricedLines ? `${t.unpricedLines} not priced` : undefined} />
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-2.5 sm:px-6">#</th>
              <th scope="col" className="px-3 py-2.5">Tender item</th>
              <th scope="col" className="px-3 py-2.5 text-right">Qty</th>
              <th scope="col" className="px-3 py-2.5">Matched <Term t="SKU" /></th>
              <th scope="col" className="px-3 py-2.5 text-right">List</th>
              <th scope="col" className="px-3 py-2.5 text-right">Disc.</th>
              <th scope="col" className="px-3 py-2.5 text-right">Unit cost</th>
              <th scope="col" className="px-3 py-2.5 text-right">Amount</th>
              <th scope="col" className="px-3 py-2.5 text-right">Bid rate</th>
              <th scope="col" className="px-5 py-2.5 sm:px-6">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const tone = lineTone(r);
              return (
                <tr key={r.item} className="align-top hover:bg-slate-50/60">
                  <td className={`border-l-2 px-5 py-3 text-slate-500 sm:px-6 ${tone === "bad" ? "border-red-500" : tone === "warn" ? "border-amber-400" : "border-transparent"}`}>{r.item}</td>
                  <td className="max-w-72 px-3 py-3">
                    <p className="text-slate-900">{r.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.unit ?? "unit ?"}
                      {r.page != null ? ` · tender p. ${r.page}` : ""}
                    </p>
                  </td>
                  <td className={num}>{r.qty ?? "—"}</td>
                  <td className="max-w-60 px-3 py-3">
                    {r.sku ? (
                      <>
                        <p className="font-mono text-xs font-medium text-slate-900">{r.sku}</p>
                        {r.skuDescription && <p className="mt-0.5 text-xs text-slate-500">{r.skuDescription}</p>}
                        {r.confidence != null && (
                          <p className={`mt-0.5 text-xs ${r.confidence < 0.7 ? "text-amber-700" : "text-slate-500"}`} title="How sure the AI was about this match (0 to 1). Below 0.7 is flagged for review.">
                            Match confidence {r.confidence.toFixed(2)}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">No matching product</span>
                    )}
                  </td>
                  <td className={num}>{inr(r.listPrice)}</td>
                  <td className={num}>{r.discountPct == null ? "—" : `${r.discountPct}%`}</td>
                  <td className={num}>{inr(r.unitCost)}</td>
                  <td className={`${num} font-medium text-slate-900`}>{inr(r.costAmount)}</td>
                  <td className={num}>{inr(r.bidRate)}</td>
                  <td className="min-w-56 px-5 py-3 sm:px-6">
                    {r.flags.length === 0 ? (
                      <StatusBadge tone="good">OK</StatusBadge>
                    ) : (
                      <ul className="space-y-1.5">
                        {r.flags.map((f, i) => (
                          <li key={i} className="text-xs leading-snug">
                            <StatusBadge tone={f.level === "red" ? "bad" : "warn"}>{f.level === "red" ? "Fix" : "Check"}</StatusBadge>
                            <span className="mt-0.5 block text-slate-700">{f.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-8 text-center text-sm text-slate-500">
                  {flaggedOnly ? "No flagged lines." : "No BOQ lines were found in this tender."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
