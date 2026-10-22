import Link from "next/link";
import type { ReactNode } from "react";
import { cacheLife } from "next/cache";
import { inr } from "@/lib/format";
import { Icon, StatusBadge, Term, btn, card, type IconName, type Tone } from "@/components/ui";
import { runDemo } from "@/lib/pipeline";
import type { AnalyzeResult } from "@/lib/schema";

// The preview on this page is GoBid's real demo report (sample tender, saved AI answers, the
// same rules as a live run), computed on the server and cached. No numbers are made up here.
async function sampleReport(): Promise<AnalyzeResult> {
  "use cache";
  cacheLife("hours");
  return runDemo() as AnalyzeResult;
}

const RESULT_TONE: Record<string, Tone> = { pass: "good", fail: "bad", unknown: "warn", info: "neutral" };
const RESULT_LABEL: Record<string, string> = { pass: "Pass", fail: "Fail", unknown: "Unknown", info: "Info" };
const DECISION_TONE: Record<string, Tone> = { GO: "good", "NO-GO": "bad", "REVIEW NEEDED": "warn" };

function ReportPreview({ r }: { r: AnalyzeResult }) {
  const order = { fail: 0, unknown: 1, pass: 2, info: 3 } as const;
  const rows = [...r.eligibility].sort((a, b) => order[a.result] - order[b.result]).slice(0, 5);
  const t = r.boq.totals;
  return (
    <div className={`${card} overflow-hidden shadow-xl shadow-blue-950/5`} aria-label="Sample GoBid report">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Icon name="file" className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate font-medium text-slate-700">Sample tender · {r.meta.pageCount} pages</span>
        </div>
        <StatusBadge tone={DECISION_TONE[r.verdict.decision]}>{r.verdict.decision}</StatusBadge>
      </div>

      <div className="px-4 pb-1 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Eligibility checks</p>
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.map((e) => (
            <li key={e.label} className="flex items-center gap-3 py-2 text-sm">
              <StatusBadge tone={RESULT_TONE[e.result]}>{RESULT_LABEL[e.result]}</StatusBadge>
              <span className="min-w-0 flex-1 truncate text-slate-800">{e.label}</span>
              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 tabular-nums text-xs text-blue-700">{e.page != null ? `p. ${e.page}` : "no page"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-3 gap-px border-t border-slate-200 bg-slate-200">
        {[
          ["BOQ bid value", inr(t.bidTotal)],
          ["Est. margin", t.marginPct == null ? "—" : `${t.marginPct}%`],
          ["Lines priced", `${t.pricedLines} / ${t.totalLines}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-white px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 border-t border-slate-200 bg-blue-50/60 px-4 py-3 text-xs text-slate-700">
        <Icon name="quote" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <p className="line-clamp-2">{r.verdict.reason}</p>
      </div>
    </div>
  );
}

const VALUE: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "clock",
    title: "Save hours on every tender",
    text: "GoBid reads the whole PDF and pulls out eligibility, required documents and the BOQ, so you start from a checklist instead of page one.",
  },
  {
    icon: "shield",
    title: "Miss fewer requirements",
    text: "Every check shows the tender page and exact quote. Anything that can't be verified is marked Unknown, never quietly passed.",
  },
  {
    icon: "rupee",
    title: "Price the BOQ faster",
    text: "Each line is matched to a product in your supplier price lists, with discount, cost, bid rate and margin worked out for you.",
  },
];

const STEPS = [
  ["Upload the tender", "Add the tender PDF and your supplier price lists (CSV). Optionally add your MAF letters and certificates."],
  ["Review eligibility", "See pass, fail or unknown for EMD, turnover, experience, OEM authorization and certificates, each with its source page."],
  ["Match and price the BOQ", "Check matched products, technical mismatches and flagged lines, then the totals and estimated margin."],
  ["Decide and export", "Read the Go / No-Go and action list, download the priced BOQ to Excel, and make the final call yourself."],
];

const FEATURES: { icon: IconName; title: string; text: ReactNode }[] = [
  { icon: "list", title: "Eligibility with evidence", text: <>EMD, turnover, experience, <Term t="MSE" /> exemptions, certificates and approved makes, checked against your firm profile.</> },
  { icon: "shield", title: "Bid readiness", text: <>Document checklist, <Term t="OEM" /> authorization (<Term t="MAF" />) check and a technical compliance matrix, with a prioritised action list.</> },
  { icon: "sheet", title: "Priced BOQ and Excel export", text: <><Term t="BOQ" /> lines matched to supplier <Term t="SKU">SKUs</Term>, with <Term t="kA" />, poles and rating mismatches flagged.</> },
  { icon: "search", title: "GeM tenders and daily alerts", text: <>New electrical and solar bids from <Term t="GeM" /> every hour, with filters and an 8 AM email for your categories.</> },
];

export default async function Home() {
  const sample = await sampleReport();
  return (
    <main>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:px-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
              <Icon name="bolt" className="h-3.5 w-3.5" />
              For electrical and solar contractors bidding on government tenders
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-blue-950 sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
              Bid smarter. <span className="text-blue-600">Miss fewer requirements.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Analyse tender documents, check eligibility, match electrical products, and calculate bid pricing — all in one workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/analyze" className={btn.primaryLg}>
                Analyse a Tender
                <Icon name="arrowRight" />
              </Link>
              <Link href="/analyze?demo=1" className={btn.secondaryLg}>
                View Sample Report
              </Link>
            </div>
            <ul className="mt-8 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              {["Page number and quote for every check", "Unknown is never treated as a pass", "Priced BOQ exported to Excel", "You make the final bid decision"].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <Icon name="check" className="h-4 w-4 shrink-0 text-blue-600" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <ReportPreview r={sample} />
            <p className="mt-3 text-center text-xs text-slate-500">Live output from GoBid&apos;s demo tender — open it with &quot;View Sample Report&quot;.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-blue-950 sm:text-3xl">A 150-page tender, turned into a checklist you can act on</h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          Small contractors lose bids on technicalities: a missing manufacturer letter, an expired certificate, a breaker quoted at the wrong rating. GoBid helps you catch them before you submit.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {VALUE.map((v) => (
            <div key={v.title} className={`${card} p-6`}>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Icon name={v.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-blue-950 sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="relative">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700">{i + 1}</span>
                <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-blue-950 sm:text-3xl">What you get</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className={`${card} flex gap-4 p-5`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Icon name={f.icon} className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-start gap-2 text-sm text-slate-500">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
          AI reads the documents; fixed, tested rules make every decision; you approve. GoBid never logs in to GeM, signs or submits bids for you.
        </p>
      </section>

      <section className="mx-auto mb-16 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-blue-100 bg-blue-50 px-6 py-8 sm:px-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-semibold text-blue-950 sm:text-2xl">Have a tender open right now?</h2>
            <p className="mt-1 text-slate-600">Upload the PDF and get eligibility, pricing and a Go / No-Go in a couple of minutes.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/analyze" className={btn.primaryLg}>
              Analyse a Tender
            </Link>
            <Link href="/tenders" className={btn.secondaryLg}>
              Browse GeM tenders
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
