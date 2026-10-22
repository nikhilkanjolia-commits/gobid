"use client";

import { useEffect, useState } from "react";
import { BoqTable, ClauseTable, VerdictBanner } from "@/components/Results";
import { downloadBoqXlsx } from "@/lib/exportXlsx";
import { extractPdfText, type PdfResult } from "@/lib/pdfText";
import { mergePriceLists, parsePriceList, type PriceListResult } from "@/lib/priceList";
import type { AnalyzeResult } from "@/lib/schema";

const SAMPLE_LISTS = ["switchgear-supplier.csv", "cables-supplier.csv"];

type PriceLists = { names: string[]; merged: PriceListResult; isSample: boolean };

async function readLists(files: { name: string; text: string }[], isSample: boolean): Promise<PriceLists> {
  return { names: files.map((f) => f.name), merged: mergePriceLists(files.map((f) => parsePriceList(f.name, f.text))), isSample };
}

export default function Home() {
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfResult | null>(null);
  const [readingPdf, setReadingPdf] = useState(false);
  const [lists, setLists] = useState<PriceLists | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

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
        <h1 className="text-3xl font-bold">GoBid</h1>
        <p className="text-gray-600">Upload a tender PDF. Get eligibility with page-cited quotes, a priced BOQ, and a Go / No-Go. AI reads, rules decide, you approve.</p>
      </header>

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
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            disabled={!ready}
            onClick={() => pdf?.ok && lists && analyze({ pages: pdf.pages, priceRows: lists.merged.rows })}
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
