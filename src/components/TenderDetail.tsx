"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { closingBadge, istDate } from "@/components/TenderCard";
import { Icon, btn, card, type IconName } from "@/components/ui";
import type { GemFile, GemFileKind } from "@/lib/gemFiles";
import type { Tender } from "@/lib/tenderQuery";

type FilesReply = { bid: string; documentUrl: string | null; pageCount: number | null; files: GemFile[]; note?: string; checkedAt?: string };

const KIND_ICON: Record<GemFileKind, IconName> = {
  spec: "file",
  boq_items: "sheet",
  atc: "list",
  catalogue: "layers",
  attachment: "file",
  om: "info",
  gtc: "shield",
};

const GEM_ALL_BIDS = "https://bidplus.gem.gov.in/all-bids";

// One tender: its details, the bid document and every file it links to, and buttons to open
// it on GeM. Files open straight from GeM in the browser; GoBid doesn't store or re-host them.
export function TenderDetail() {
  const bid = (useSearchParams().get("bid") ?? "").trim().toUpperCase();
  const [tender, setTender] = useState<Tender | null | undefined>(undefined);
  const [files, setFiles] = useState<FilesReply | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState<number | null>(null);

  useEffect(() => {
    if (!bid) return;
    let cancelled = false;
    fetch(`/api/tenders?${new URLSearchParams({ q: bid, tab: "all", page_size: "10" })}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setTender((d.results as Tender[] | undefined)?.find((t) => t.bid_number === bid) ?? null))
      .catch(() => !cancelled && setTender(null));
    fetch(`/api/tenders/documents?${new URLSearchParams({ bid })}`)
      .then(async (r) => [r.ok, await r.json()] as const)
      .then(([ok, d]) => {
        if (cancelled) return;
        if (ok) setFiles(d);
        else setFilesError(d.error ?? "Couldn't list the bid's files.");
      })
      .catch(() => !cancelled && setFilesError("Couldn't reach the server. Try again."));
    return () => {
      cancelled = true;
    };
  }, [bid]);

  async function findOnGem() {
    try {
      await navigator.clipboard.writeText(bid);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {}
    window.open(GEM_ALL_BIDS, "_blank", "noopener");
  }

  // Opens every file in its own tab. Browsers allow the first and may ask to allow pop-ups
  // for the rest; the count tells the user how many should have opened.
  function openAll(list: string[]) {
    for (const url of list) window.open(url, "_blank", "noopener");
    setOpened(list.length);
  }

  if (!bid) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-slate-600">No bid chosen. Pick a tender from <Link href="/tenders" className="text-blue-700 underline">GeM tenders</Link>.</p>
      </main>
    );
  }

  const badge = tender ? closingBadge(tender.ends_at) : null;
  const docUrl = tender?.document_url ?? files?.documentUrl ?? null;
  const allUrls = [...(docUrl ? [docUrl] : []), ...(files?.files.map((f) => f.url) ?? [])];
  const analyze = `/analyze?${new URLSearchParams({ bid, ...(docUrl ? { doc: docUrl } : {}) })}`;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/tenders" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <Icon name="arrowRight" className="h-4 w-4 rotate-180" /> All GeM tenders
      </Link>

      <section className={`${card} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-sm font-semibold text-slate-900">{bid}</span>
          {tender?.bid_kind && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">{tender.bid_kind === "RA" ? "Reverse auction" : "Bid"}</span>
          )}
          {tender?.is_high_value && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">High value</span>}
          {badge && <span className={`ml-auto rounded px-2 py-0.5 font-semibold ${badge.cls}`}>{badge.text}</span>}
        </div>
        {tender === undefined && <p className="mt-3 text-sm text-slate-500">Loading tender…</p>}
        {tender === null && <p className="mt-3 text-sm text-slate-600">GoBid hasn&apos;t collected this bid, or it couldn&apos;t be loaded. You can still look it up on GeM.</p>}
        {tender && (
          <>
            <h1 className="mt-3 text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">{tender.items || "Items not listed"}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {[tender.ministry, tender.department && tender.department !== "NA" ? tender.department : null].filter(Boolean).join(" › ") || "Ministry not listed"}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {[
                ["Start date", istDate(tender.starts_at)],
                ["End date", istDate(tender.ends_at)],
                ["Quantity", tender.quantity ?? "—"],
                ["BOQ", tender.has_boq ? "Yes" : "No"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          {docUrl && (
            <a href={docUrl} target="_blank" rel="noreferrer" className={btn.primary}>
              <Icon name="external" /> Open on GeM
            </a>
          )}
          <button type="button" onClick={findOnGem} className={btn.secondary}>
            <Icon name="search" /> Find on GeM portal
          </button>
          <Link href={analyze} className={btn.secondary}>
            <Icon name="bolt" /> Analyse this tender
          </Link>
        </div>
        {copied && (
          <p role="status" className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-sm text-blue-900">
            Bid number {bid} copied. Paste it into the search box on the GeM page that just opened.
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="files-title">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 id="files-title" className="text-base font-semibold text-slate-900">
              Bid documents
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">The bid document and every file it links to: specification, BOQ, ATC and terms.</p>
          </div>
          {allUrls.length > 1 && (
            <button type="button" onClick={() => openAll(allUrls)} className={btn.primary}>
              <Icon name="download" /> Download all ({allUrls.length})
            </button>
          )}
        </header>

        {opened != null && (
          <p role="status" className="mx-5 mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 sm:mx-6">
            Opening {opened} files from GeM. If only one opened, your browser blocked the rest: allow pop-ups for this site (icon in the address bar) and click again.
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {docUrl && (
            <FileRow icon="file" label="Bid document (all bid details)" name={`${bid.replaceAll("/", "-")}.pdf`} meta={files?.pageCount ? `${files.pageCount} pages` : "PDF on GeM"} url={docUrl} highlight />
          )}
          {files?.files.map((f) => (
            <FileRow key={f.url} icon={KIND_ICON[f.kind]} label={f.label} name={f.fileName} meta={`Linked on page ${f.pages.slice(0, 3).join(", ")}${f.pages.length > 3 ? "…" : ""}`} url={f.url} />
          ))}
        </ul>

        {!files && !filesError && (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500 sm:px-6">
            <Icon name="spinner" /> Reading the bid document from GeM for its attachments…
          </p>
        )}
        {filesError && (
          <p role="alert" className="flex items-start gap-2 px-5 py-4 text-sm text-red-800 sm:px-6">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            {filesError} You can still open the bid document on GeM above.
          </p>
        )}
        {files && files.files.length === 0 && (
          <p className="px-5 py-4 text-sm text-slate-600 sm:px-6">{files.note ?? "This bid document doesn't link to any other files."}</p>
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
          Files open directly from GeM in your browser; GoBid doesn&apos;t store or re-host them. Always check the latest corrigendum on GeM.
        </p>
      </section>
    </main>
  );
}

function FileRow({ icon, label, name, meta, url, highlight }: { icon: IconName; label: string; name: string | null; meta: string; url: string; highlight?: boolean }) {
  return (
    <li className={`flex items-center gap-3 px-5 py-3 sm:px-6 ${highlight ? "bg-blue-50/40" : ""}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-500" title={name ?? undefined}>
          {name ? `${name} · ` : ""}
          {meta}
        </span>
      </span>
      <a href={url} target="_blank" rel="noreferrer" className={btn.small} aria-label={`Download ${label}`}>
        <Icon name="download" className="h-3.5 w-3.5" /> Download
      </a>
    </li>
  );
}
