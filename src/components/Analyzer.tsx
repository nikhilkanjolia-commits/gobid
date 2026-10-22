"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BidReadiness } from "@/components/BidReadiness";
import { BoqTable, ClauseTable, ReportSummary } from "@/components/Results";
import { Icon, Term, btn, card, type IconName } from "@/components/ui";
import { downloadBoqXlsx } from "@/lib/exportXlsx";
import { extractPdfText, type PdfResult } from "@/lib/pdfText";
import { mergePriceLists, parsePriceList, type PriceListResult } from "@/lib/priceList";
import type { AnalyzeResult } from "@/lib/schema";

const SAMPLE_LISTS = ["switchgear-supplier.csv", "cables-supplier.csv"];
const MAX_SUPPORT = 8;

type SupportingDoc = { name: string; pages: { page: number; text: string }[]; unreadable: boolean; error: string | null };

type PriceLists = { names: string[]; merged: PriceListResult; isSample: boolean };

async function readLists(files: { name: string; text: string }[], isSample: boolean): Promise<PriceLists> {
  return { names: files.map((f) => f.name), merged: mergePriceLists(files.map((f) => parsePriceList(f.name, f.text))), isSample };
}

async function loadSampleLists() {
  const files = await Promise.all(SAMPLE_LISTS.map(async (name) => ({ name, text: await (await fetch(`/samples/${name}`)).text() })));
  return readLists(files, true);
}

// What the server does during an analysis. Shown as a list, not as live progress: the server
// doesn't report which step it is on, so nothing here is ticked off or given a percentage.
const PIPELINE = ["Reading the tender pages", "Finding eligibility clauses and required documents", "Extracting BOQ lines and matching products", "Checking quotes, rules and pricing", "Preparing the report"];

// A file picker that also accepts drag and drop.
function DropZone({
  id,
  label,
  hint,
  accept,
  multiple,
  icon,
  onFiles,
  children,
  optional,
}: {
  id: string;
  label: string;
  hint: ReactNode;
  accept: string;
  multiple?: boolean;
  icon: IconName;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
  optional?: boolean;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-slate-900">
          {label}
        </label>
        {optional && <span className="text-xs text-slate-500">Optional</span>}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) onFiles(files);
        }}
        className={`relative flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:border-blue-600 focus-within:bg-blue-50/50 ${
          over ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-slate-50/60 hover:border-slate-400"
        }`}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-medium">Drag and drop</span> or{" "}
          <button type="button" onClick={() => inputRef.current?.click()} className="rounded font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600">
            browse files
          </button>
        </p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
          tabIndex={-1}
          className="sr-only"
        />
      </div>
      {children && <div className="mt-2 space-y-1.5">{children}</div>}
    </div>
  );
}

function FileLine({ tone, name, detail, onRemove }: { tone: "ok" | "bad" | "warn" | "busy"; name: string; detail: string; onRemove?: () => void }) {
  const style = {
    ok: { icon: "check" as const, cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    bad: { icon: "x" as const, cls: "border-red-200 bg-red-50 text-red-800" },
    warn: { icon: "alert" as const, cls: "border-amber-200 bg-amber-50 text-amber-900" },
    busy: { icon: "spinner" as const, cls: "border-slate-200 bg-white text-slate-700" },
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${style.cls}`}>
      <Icon name={style.icon} className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium" title={name}>
          {name}
        </span>
        <span className="block text-xs opacity-90">{detail}</span>
      </span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="rounded p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-blue-600">
          <Icon name="x" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// bid / doc: set when opened from a tender card ("Analyse"), so the page can say which bid
// and link its document on GeM. The PDF itself is still downloaded and uploaded by the user.
// demo: opened from "View Sample Report", so the sample analysis runs straight away.
export default function Analyzer({ bid, doc, demo }: { bid?: string; doc?: string; demo?: boolean }) {
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfResult | null>(null);
  const [readingPdf, setReadingPdf] = useState(false);
  const [lists, setLists] = useState<PriceLists | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [support, setSupport] = useState<SupportingDoc[]>([]);
  const [supportNote, setSupportNote] = useState<string | null>(null);
  const [readingSupport, setReadingSupport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const demoStarted = useRef(false);

  // Start with the sample price lists until the user picks their own.
  useEffect(() => {
    loadSampleLists().then(setLists);
  }, []);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Bring the report into view once it arrives.
  useEffect(() => {
    if (result) reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  async function onPdf(file: File | undefined) {
    setPdf(null);
    setResult(null);
    setError(null);
    setPdfName(file?.name ?? null);
    if (!file) return;
    setReadingPdf(true);
    setPdf(/\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await extractPdfText(file) : { ok: false, error: "This isn't a PDF. Choose the tender as a .pdf file." });
    setReadingPdf(false);
  }

  async function onCsvs(files: File[]) {
    setResult(null);
    if (files.length === 0) return;
    if (files.length > 2) {
      setLists({ names: [], merged: { rows: [], errors: ["Choose at most 2 price lists."], warnings: [] }, isSample: false });
      return;
    }
    setLists(await readLists(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))), false));
  }

  // Supporting documents (MAF, certificates, POs): PDFs only, read to text here. A scanned or
  // broken file is kept in the list as "unreadable" so the report says it wasn't analysed.
  async function onSupport(files: File[]) {
    setResult(null);
    setSupportNote(null);
    if (files.length > MAX_SUPPORT) {
      setSupport([]);
      setSupportNote(`Choose at most ${MAX_SUPPORT} supporting documents.`);
      return;
    }
    setReadingSupport(true);
    const docs: SupportingDoc[] = [];
    for (const f of files) {
      if (!/\.pdf$/i.test(f.name)) {
        docs.push({ name: f.name, pages: [], unreadable: true, error: "Not a PDF. Only PDF supporting documents can be read." });
        continue;
      }
      const r = await extractPdfText(f);
      docs.push(
        r.ok
          ? { name: f.name, pages: r.pages.slice(0, 30).map((p) => ({ page: p.page, text: p.text.slice(0, 20000) })), unreadable: false, error: null }
          : { name: f.name, pages: [], unreadable: true, error: r.error },
      );
    }
    setSupport(docs);
    setReadingSupport(false);
  }

  async function analyze(body: unknown) {
    setRunning(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({ error: "Analysis failed: the server sent an unreadable reply. Nothing was decided." }));
      if (!res.ok || data.error) setError(data.error ?? `Analysis failed (${res.status}). Nothing was decided.`);
      else setResult(data);
    } catch {
      setError("Analysis failed: couldn't reach the server. Nothing was decided. Try again.");
    } finally {
      setRunning(false);
    }
  }

  // "View Sample Report": run the demo once on arrival.
  useEffect(() => {
    if (demo && !demoStarted.current) {
      demoStarted.current = true;
      analyze({ demo: true });
    }
  }, [demo]);

  const listErrors = lists?.merged.errors ?? [];
  const ready = pdf?.ok && lists && listErrors.length === 0 && lists.merged.rows.length > 0 && !running && !readingSupport;
  const isDemo = result?.meta.mode === "demo";
  const reportTitle = result ? (result.readiness.tenderReference ?? bid ?? (isDemo ? "Sample tender (demo)" : pdfName) ?? "Tender") : "";
  const missing = !pdf?.ok ? "Add a tender PDF to continue." : listErrors.length ? "Fix the price list errors to continue." : null;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-blue-950 sm:text-3xl">Analyse a tender</h1>
          <p className="mt-2 text-slate-600">
            GoBid will extract tender requirements, check eligibility, identify potential compliance gaps, and prepare a priced <Term t="BOQ" />.
          </p>
        </div>
        <button disabled={running} onClick={() => analyze({ demo: true })} className={btn.secondary}>
          <Icon name="file" />
          View sample report
        </button>
      </header>

      {bid && (
        <p className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Bid <span className="font-semibold">{bid}</span>:{" "}
            {doc ? (
              <a href={doc} target="_blank" rel="noreferrer" className="font-semibold underline">
                open its bid document on GeM
              </a>
            ) : (
              "open its bid document on GeM"
            )}
            , download the PDF, then add it below.
          </span>
        </p>
      )}

      <section className={`${card} p-5 sm:p-6`} aria-label="Files to analyse">
        <div className="grid gap-6 md:grid-cols-2">
          <DropZone id="pdf" label="1. Tender document" hint="PDF with selectable text (scanned PDFs can't be read yet)" accept="application/pdf,.pdf" icon="file" onFiles={(f) => onPdf(f[0])}>
            {readingPdf && <FileLine tone="busy" name={pdfName ?? "Tender"} detail="Reading pages…" />}
            {pdf?.ok && <FileLine tone="ok" name={pdfName ?? "Tender"} detail={`${pdf.pages.length} pages of text read`} onRemove={() => onPdf(undefined)} />}
            {pdf && !pdf.ok && <FileLine tone="bad" name={pdfName ?? "Tender"} detail={pdf.error} onRemove={() => onPdf(undefined)} />}
          </DropZone>

          <DropZone
            id="csv"
            label="2. Supplier price lists"
            hint={
              <>
                1–2 CSV files with columns sku, description, brand, unit, list_price, discount_pct ·{" "}
                <a href="/samples/switchgear-supplier.csv" download className="text-blue-700 underline-offset-2 hover:underline">
                  sample
                </a>
              </>
            }
            accept=".csv,text/csv"
            multiple
            icon="sheet"
            onFiles={onCsvs}
          >
            {lists && listErrors.length === 0 && (
              <FileLine
                tone="ok"
                name={lists.isSample ? "Sample price lists" : lists.names.join(", ")}
                detail={`${lists.isSample ? `${lists.names.join(", ")} · ` : ""}${lists.merged.rows.length} products`}
                onRemove={lists.isSample ? undefined : () => loadSampleLists().then(setLists)}
              />
            )}
            {listErrors.map((e) => (
              <FileLine key={e} tone="bad" name="Price list problem" detail={e} onRemove={() => loadSampleLists().then(setLists)} />
            ))}
            {lists?.merged.warnings.map((w) => (
              <FileLine key={w} tone="warn" name="Warning" detail={w} />
            ))}
          </DropZone>
        </div>

        <div className="mt-6">
          <DropZone
            id="support"
            label="3. Supporting documents"
            optional
            hint={
              <>
                Your <Term t="MAF" /> letters, certificates, POs or CA certificate · PDF, up to {MAX_SUPPORT} files
              </>
            }
            accept="application/pdf,.pdf"
            multiple
            icon="upload"
            onFiles={onSupport}
          >
            {readingSupport && <FileLine tone="busy" name="Supporting documents" detail="Reading…" />}
            {supportNote && <FileLine tone="bad" name="Too many files" detail={supportNote} />}
            {!readingSupport &&
              support.map((d) => (
                <FileLine
                  key={d.name}
                  tone={d.unreadable ? "warn" : "ok"}
                  name={d.name}
                  detail={d.unreadable ? `${d.error} It will be listed as not analysed.` : `${d.pages.length} page${d.pages.length === 1 ? "" : "s"} of text read`}
                  onRemove={() => setSupport((s) => s.filter((x) => x.name !== d.name))}
                />
              ))}
            {support.length === 0 && !supportNote && !readingSupport && (
              <p className="text-xs text-slate-500">Used for the bid readiness checks. Without them, required documents show as Missing or Needs review.</p>
            )}
          </DropZone>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
          <button
            disabled={!ready}
            onClick={() => pdf?.ok && lists && analyze({ pages: pdf.pages, priceRows: lists.merged.rows, supportingDocs: support })}
            className={btn.primaryLg}
          >
            {running ? <Icon name="spinner" /> : <Icon name="bolt" />}
            {running ? "Analysing…" : "Analyse Tender"}
          </button>
          <p className="text-sm text-slate-500">{running ? "" : (missing ?? "Usually takes 1–2 minutes for a 150-page tender.")}</p>
        </div>
      </section>

      {running && (
        <section className={`${card} p-5 sm:p-6`} role="status" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <Icon name="spinner" className="h-5 w-5 text-blue-600" />
            <p className="font-semibold text-slate-900">Analysing your tender</p>
            <span className="ml-auto font-mono text-sm tabular-nums text-slate-500">{elapsed}s</span>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600/60" />
          </div>
          <p className="mt-4 text-sm text-slate-600">What GoBid does during this step:</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-slate-700 sm:grid-cols-2">
            {PIPELINE.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Keep this page open. Nothing is decided until every check is complete.</p>
        </section>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">The analysis didn&apos;t finish</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!result && !running && !error && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="What you'll get">
          {(
            [
              ["list", "Eligibility checklist", "Pass, fail or unknown for each requirement, with the tender page and quote."],
              ["shield", "Bid readiness", "Missing documents, OEM authorization and technical compliance."],
              ["rupee", "Priced BOQ", "Products matched from your price lists, with cost, bid rate and margin."],
              ["check", "Go / No-Go", "A recommendation with the reason and a prioritised action list."],
            ] as const
          ).map(([icon, title, text]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white/60 p-4">
              <Icon name={icon} className="h-5 w-5 text-blue-600" />
              <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </section>
      )}

      {result && (
        <div ref={reportRef} className="scroll-mt-20 space-y-6">
          <ReportSummary result={result} title={reportTitle} onDownload={() => downloadBoqXlsx(result)} />

          <nav aria-label="Report sections" className="no-scrollbar sticky top-[6.75rem] z-10 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur lg:top-[4.5rem]">
            {[
              ["#eligibility", `Eligibility (${result.eligibility.length})`],
              ["#readiness", "Bid readiness"],
              ["#boq", `BOQ pricing (${result.boq.totals.totalLines})`],
            ].map(([href, label]) => (
              <a key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                {label}
              </a>
            ))}
          </nav>

          <ClauseTable rows={result.eligibility} />
          <BidReadiness readiness={result.readiness} />
          <BoqTable boq={result.boq} onDownload={() => downloadBoqXlsx(result)} />

          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <p>
              <span className="font-semibold">You make the final call.</span> Check every fail, unknown and flagged line against the cited page, confirm this is the latest corrigendum, set
              your final prices in the Excel file, then sign and submit on the portal yourself.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
