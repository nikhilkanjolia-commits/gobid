"use client";

import { useEffect, useState } from "react";
import { BidReadiness } from "@/components/BidReadiness";
import { BoqTable, ClauseTable, VerdictBanner } from "@/components/Results";
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

// bid / doc: set when opened from a tender card ("Analyze"), so the page can say which bid
// and link its document on GeM. The PDF itself is still downloaded and uploaded by the user.
export default function Analyzer({ bid, doc }: { bid?: string; doc?: string }) {
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

  // Start with the sample price lists until the user picks their own.
  useEffect(() => {
    Promise.all(SAMPLE_LISTS.map(async (name) => ({ name, text: await (await fetch(`/samples/${name}`)).text() })))
      .then((files) => readLists(files, true))
      .then(setLists);
  }, []);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  async function onPdf(file: File | undefined) {
    setPdf(null);
    setResult(null);
    setError(null);
    setPdfName(file?.name ?? null);
    if (!file) return;
    setReadingPdf(true);
    setPdf(await extractPdfText(file));
    setReadingPdf(false);
  }

  async function onCsvs(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
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
  async function onSupport(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
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

  const listErrors = lists?.merged.errors ?? [];
  const ready = pdf?.ok && lists && listErrors.length === 0 && lists.merged.rows.length > 0 && !running;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold">Analyze a tender</h1>
        <p className="text-gray-600">Upload a tender PDF. Get eligibility with page-cited quotes, a priced BOQ, and a Go / No-Go. AI reads, rules decide, you approve.</p>
      </header>
      {bid && (
        <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Bid <span className="font-semibold">{bid}</span>:{" "}
          {doc ? (
            <a href={doc} target="_blank" rel="noreferrer" className="font-semibold underline">
              open its bid document on GeM
            </a>
          ) : (
            "open its bid document on GeM"
          )}
          , download the PDF, then pick it below.
        </p>
      )}

      <section className="grid gap-4 rounded-lg border bg-gray-50 p-4 sm:grid-cols-2">
        <div>
          <label className="block font-medium" htmlFor="pdf">1. Tender PDF (text-based)</label>
          <input id="pdf" type="file" accept="application/pdf,.pdf" onChange={(e) => onPdf(e.target.files?.[0])} className="mt-2 block w-full text-sm" />
          {readingPdf && <p className="mt-2 text-sm text-gray-600">Reading {pdfName}…</p>}
          {pdf?.ok && <p className="mt-2 text-sm text-green-700">✓ {pdfName}: {pdf.pages.length} pages of text read</p>}
          {pdf && !pdf.ok && <p className="mt-2 text-sm text-red-700">✗ {pdf.error}</p>}
        </div>
        <div>
          <label className="block font-medium" htmlFor="csv">2. Supplier price lists (1–2 CSV files)</label>
          <input id="csv" type="file" accept=".csv,text/csv" multiple onChange={(e) => onCsvs(e.target.files)} className="mt-2 block w-full text-sm" />
          {lists && listErrors.length === 0 && (
            <p className="mt-2 text-sm text-green-700">
              ✓ {lists.isSample ? "Using sample lists: " : ""}
              {lists.names.join(", ")} ({lists.merged.rows.length} SKUs)
            </p>
          )}
          {listErrors.map((e) => (
            <p key={e} className="mt-1 text-sm text-red-700">✗ {e}</p>
          ))}
          {lists?.merged.warnings.map((w) => (
            <p key={w} className="mt-1 text-sm text-amber-800">⚠ {w}</p>
          ))}
        </div>
        <div className="sm:col-span-2">
          <label className="block font-medium" htmlFor="support">
            Supporting documents <span className="font-normal text-gray-600">(optional: MAF letter, certificates, POs, CA certificate — PDF, up to {MAX_SUPPORT})</span>
          </label>
          <input id="support" type="file" accept="application/pdf,.pdf" multiple onChange={(e) => onSupport(e.target.files)} className="mt-2 block w-full text-sm" />
          {readingSupport && <p className="mt-2 text-sm text-gray-600">Reading documents…</p>}
          {supportNote && <p className="mt-2 text-sm text-red-700">✗ {supportNote}</p>}
          {support.map((d) => (
            <p key={d.name} className={`mt-1 text-sm ${d.unreadable ? "text-amber-800" : "text-green-700"}`}>
              {d.unreadable ? `⚠ ${d.name}: ${d.error} It will be listed as not analysed.` : `✓ ${d.name}: ${d.pages.length} page${d.pages.length === 1 ? "" : "s"} of text read`}
            </p>
          ))}
          <p className="mt-1 text-xs text-gray-500">Used for the Bid Readiness checks. Without them, required documents show as Missing or Needs review.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            disabled={!ready || readingSupport}
            onClick={() => pdf?.ok && lists && analyze({ pages: pdf.pages, priceRows: lists.merged.rows, supportingDocs: support })}
            className="rounded bg-blue-700 px-5 py-2 font-semibold text-white enabled:hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            3. Analyze tender
          </button>
          <button disabled={running} onClick={() => analyze({ demo: true })} className="rounded border border-gray-400 px-4 py-2 text-sm hover:bg-white disabled:opacity-50">
            Try the demo tender (no AI needed)
          </button>
          {running && <span className="text-sm text-gray-700">Analyzing… {elapsed}s (a 150-page tender takes about 2 minutes)</span>}
        </div>
      </section>

      {error && <p className="rounded border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}

      {result && (
        <>
          <VerdictBanner result={result} />
          <ClauseTable rows={result.eligibility} />
          <BidReadiness readiness={result.readiness} />
          <BoqTable boq={result.boq} onDownload={() => downloadBoqXlsx(result)} />
          <p className="text-sm text-gray-600">
            You decide: check every fail, unknown and flagged line against the cited page, confirm this is the latest corrigendum,
            set your final prices in the .xlsx, then sign and submit on the portal yourself.
          </p>
        </>
      )}
    </main>
  );
}
