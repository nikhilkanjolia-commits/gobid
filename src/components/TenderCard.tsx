import Link from "next/link";
import type { Tender } from "@/lib/tenderQuery";

// Dates are shown in India time, whatever the viewer's clock says.
export function istDate(iso: string | null, withTime = true) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function closingBadge(endsAt: string | null) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return { text: "Closed", cls: "bg-slate-200 text-slate-700" };
  const hours = ms / 3_600_000;
  if (hours < 24) return { text: `Closes in ${Math.max(1, Math.round(hours))} h`, cls: "bg-red-100 text-red-800" };
  const days = Math.round(hours / 24);
  return { text: `${days} day${days === 1 ? "" : "s"} left`, cls: days <= 3 ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800" };
}

export function TenderCard({ t }: { t: Tender }) {
  const badge = closingBadge(t.ends_at);
  const analyze = `/analyze?${new URLSearchParams({ bid: t.bid_number, ...(t.document_url ? { doc: t.document_url } : {}) })}`;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono font-semibold text-slate-800">{t.bid_number}</span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${t.bid_kind === "RA" ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-700"}`}>
          {t.bid_kind === "RA" ? "Reverse auction" : "Bid"}
        </span>
        {t.is_high_value && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">High value</span>}
        {badge && <span className={`ml-auto rounded px-2 py-0.5 font-semibold ${badge.cls}`}>{badge.text}</span>}
      </div>

      <h3 className="mt-2 line-clamp-2 text-base font-semibold text-slate-900" title={t.items}>
        {t.items || "Items not listed"}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        {[t.ministry, t.department && t.department !== "NA" ? t.department : null].filter(Boolean).join(" › ") || "Ministry not listed"}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Start date</dt>
          <dd>{istDate(t.starts_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">End date</dt>
          <dd className="font-medium">{istDate(t.ends_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Quantity</dt>
          <dd>{t.quantity ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {t.categories.map((c) => (
          <span key={c} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
            {c}
          </span>
        ))}
        {t.matched_keywords.map((k) => (
          <span key={k} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
            {k}
          </span>
        ))}
        <span className="ml-auto flex gap-2">
          {t.document_url && (
            <a href={t.document_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
              View on GeM ↗
            </a>
          )}
          <Link href={analyze} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Analyse
          </Link>
        </span>
      </div>
    </article>
  );
}
