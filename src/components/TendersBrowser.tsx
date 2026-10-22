"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TenderCard, istDate } from "@/components/TenderCard";
import { loadPrefs, prefsToParams, savePrefs } from "@/lib/prefs";
import { TABS, type TenderFacets, type TenderPage } from "@/lib/tenderQuery";

const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  live: "Live",
  closing_soon: "Closing soon",
  new: "New today",
  closed: "Closed",
  all: "All",
};

const SORT_LABELS: Record<string, string> = {
  publish_date_desc: "Newest published",
  closing_date_asc: "Closing soonest",
  closing_date_desc: "Closing latest",
  first_seen_desc: "Newest on GoBid",
};

const listOf = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

// The Tenders page: status tabs, a filter panel and the results. Every choice lives in the
// page address (?tab=…&category=…), so a search can be bookmarked or shared.
export function TendersBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramString = params.toString();

  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as (typeof TABS)[number]) : "live";
  const q = params.get("q") ?? "";
  const categories = listOf(params.get("category"));
  const keywords = listOf(params.get("keyword"));
  const ministry = params.get("ministry") ?? "";
  const kind = params.get("kind") ?? "";
  const highValue = params.get("high_value") === "true";
  const closingFrom = params.get("closing_from") ?? "";
  const closingTo = params.get("closing_to") ?? "";
  const sort = params.get("sort") ?? "publish_date_desc";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Number(params.get("page_size")) || 20;

  // The last loaded answer, tagged with the address it was for: while the address differs,
  // a new answer is loading (the old one stays on screen, dimmed).
  const [loaded, setLoaded] = useState<{ key: string; results: TenderPage | null; facets: TenderFacets | null; error: string | null } | null>(null);
  const loading = loaded?.key !== paramString;
  const results = loaded?.results ?? null;
  const facets = loaded?.facets ?? null;
  const error = loading ? null : (loaded?.error ?? null);
  const [showFilters, setShowFilters] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Changes some parameters; any filter change goes back to page 1.
  function update(changes: Record<string, string | string[] | null>, keepPage = false) {
    const next = new URLSearchParams(paramString);
    for (const [k, v] of Object.entries(changes)) {
      const value = Array.isArray(v) ? v.join(",") : v;
      if (value) next.set(k, value);
      else next.delete(k);
    }
    if (!keepPage) next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  // On a plain visit (no filters in the address), apply "My preferences" once.
  const appliedPrefs = useRef(false);
  useEffect(() => {
    if (appliedPrefs.current) return;
    appliedPrefs.current = true;
    if (paramString) return;
    const prefs = loadPrefs();
    if (prefs) {
      const sp = prefsToParams(prefs);
      if (sp.toString()) router.replace(`${pathname}?${sp}`, { scroll: false });
    }
  }, [paramString, pathname, router]);

  useEffect(() => {
    let cancelled = false;
    const facetParams = new URLSearchParams({ tab, ...(q ? { q } : {}) });
    Promise.all([
      fetch(`/api/tenders?${new URLSearchParams(paramString)}`).then(async (r) => [r.ok, await r.json()] as const),
      fetch(`/api/tenders/facets?${facetParams}`).then(async (r) => [r.ok, await r.json()] as const),
    ])
      .then(([[okR, r], [okF, f]]) => {
        if (cancelled) return;
        setLoaded((prev) => ({
          key: paramString,
          results: okR ? r : (prev?.results ?? null),
          facets: okF ? f : (prev?.facets ?? null),
          error: okR ? null : (r.error ?? "Couldn't load tenders."),
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded((prev) => ({ key: paramString, results: prev?.results ?? null, facets: prev?.facets ?? null, error: "Couldn't reach the server. Check your connection and try again." }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [paramString, tab, q]);

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const totalPages = results ? Math.max(1, Math.ceil(results.total / pageSize)) : 1;

  const chips: { label: string; clear: Record<string, string | string[] | null> }[] = [
    ...categories.map((c) => ({ label: c, clear: { category: categories.filter((x) => x !== c) } })),
    ...keywords.map((k) => ({ label: `“${k}”`, clear: { keyword: keywords.filter((x) => x !== k) } })),
    ...(ministry ? [{ label: ministry, clear: { ministry: null } }] : []),
    ...(kind ? [{ label: kind === "RA" ? "Reverse auctions" : "Bids", clear: { kind: null } }] : []),
    ...(highValue ? [{ label: "High value", clear: { high_value: null } }] : []),
    ...(closingFrom || closingTo ? [{ label: `Closing ${closingFrom || "…"} to ${closingTo || "…"}`, clear: { closing_from: null, closing_to: null } }] : []),
  ];

  function saveAsPrefs() {
    const ok = savePrefs({ category: categories, keyword: keywords, ministry: ministry || undefined, sort, page_size: pageSize });
    setNotice(ok ? "Saved as your preferences. They'll load each time you open Tenders." : "Couldn't save: this browser blocks storage.");
    setTimeout(() => setNotice(null), 4000);
  }

  const filters = (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-2 font-semibold text-gray-900">Category</h3>
        {(facets?.categories ?? []).map((c) => (
          <label key={c.category} className="flex cursor-pointer items-center gap-2 py-0.5">
            <input type="checkbox" checked={categories.includes(c.category)} onChange={() => update({ category: toggle(categories, c.category) })} />
            <span className="flex-1">{c.category}</span>
            <span className="text-xs text-gray-500">{c.count}</span>
          </label>
        ))}
      </section>

      <details open={keywords.length > 0}>
        <summary className="cursor-pointer font-semibold text-gray-900">Keywords</summary>
        <div className="mt-2 max-h-56 overflow-y-auto pr-1">
          {(facets?.keywords ?? [])
            .filter((k) => !categories.length || categories.includes(k.category))
            .map((k) => (
              <label key={k.keyword} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input type="checkbox" checked={keywords.includes(k.keyword)} onChange={() => update({ keyword: toggle(keywords, k.keyword) })} />
                <span className="flex-1">{k.keyword}</span>
                <span className="text-xs text-gray-500">{k.count}</span>
              </label>
            ))}
        </div>
      </details>

      <section>
        <label htmlFor="ministry" className="mb-2 block font-semibold text-gray-900">
          Ministry
        </label>
        <select id="ministry" value={ministry} onChange={(e) => update({ ministry: e.target.value || null })} className="w-full rounded border bg-white px-2 py-1.5">
          <option value="">Any ministry</option>
          {ministry && !facets?.ministries.some((m) => m.ministry === ministry) && <option value={ministry}>{ministry}</option>}
          {(facets?.ministries ?? []).map((m) => (
            <option key={m.ministry} value={m.ministry}>
              {m.ministry} ({m.count})
            </option>
          ))}
        </select>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-gray-900">Type</h3>
        {[
          ["", "All", (facets?.kinds.BID ?? 0) + (facets?.kinds.RA ?? 0)],
          ["BID", "Bids", facets?.kinds.BID],
          ["RA", "Reverse auctions", facets?.kinds.RA],
        ].map(([value, label, count]) => (
          <label key={String(value)} className="flex cursor-pointer items-center gap-2 py-0.5">
            <input type="radio" name="kind" checked={kind === value} onChange={() => update({ kind: (value as string) || null })} />
            <span className="flex-1">{label}</span>
            <span className="text-xs text-gray-500">{count ?? ""}</span>
          </label>
        ))}
        <label className="mt-2 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={highValue} onChange={() => update({ high_value: highValue ? null : "true" })} />
          <span className="flex-1">High-value bids only</span>
          <span className="text-xs text-gray-500">{facets?.high_value ?? ""}</span>
        </label>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-gray-900">Closing date</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600">
            From
            <input type="date" value={closingFrom} onChange={(e) => update({ closing_from: e.target.value || null })} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            To
            <input type="date" value={closingTo} onChange={(e) => update({ closing_to: e.target.value || null })} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
          </label>
        </div>
      </section>

      <div className="flex flex-col gap-2 border-t pt-4">
        <button onClick={saveAsPrefs} className="rounded bg-gray-900 px-3 py-2 font-medium text-white hover:bg-gray-700">
          Save as my preferences
        </button>
        <button
          onClick={() => router.replace(`${pathname}?${new URLSearchParams({ tab })}`, { scroll: false })}
          className="rounded border px-3 py-2 hover:bg-gray-50"
        >
          Clear all filters
        </button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">GeM tenders</h1>
          <p className="text-sm text-gray-600">
            Electrical and solar bids from the Government e-Marketplace, refreshed every hour
            {facets?.last_run ? ` · last checked ${istDate(facets.last_run.ran_at)}` : ""}.
          </p>
        </div>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = String(new FormData(e.currentTarget).get("q") ?? "").trim();
          update({ q: text || null });
        }}
      >
        <input
          key={q}
          name="q"
          defaultValue={q}
          placeholder="Search items, ministry, department or bid number (e.g. MCCB 63A, solar, GEM/2026/B/…)"
          className="min-w-0 flex-1 rounded border bg-white px-3 py-2"
          aria-label="Search tenders"
        />
        <button className="rounded bg-blue-700 px-5 py-2 font-semibold text-white hover:bg-blue-800">Search</button>
      </form>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b" aria-label="Tender status">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => update({ tab: t === "live" ? null : t })}
            aria-current={tab === t ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? "border-blue-700 text-blue-800" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {TAB_LABELS[t]}
            {facets && <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{facets.tabs[t]}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-72 lg:shrink-0">
          <button onClick={() => setShowFilters((s) => !s)} className="w-full rounded border bg-white px-3 py-2 text-sm font-medium lg:hidden">
            {showFilters ? "Hide filters" : `Filters${chips.length ? ` (${chips.length})` : ""}`}
          </button>
          <div className={`${showFilters ? "mt-3 block" : "hidden"} rounded-lg border bg-white p-4 lg:sticky lg:top-20 lg:mt-0 lg:block`}>{filters}</div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-700">{loading ? "Loading…" : results ? `${results.total} tender${results.total === 1 ? "" : "s"}` : ""}</p>
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-700">
              Sort
              <select value={sort} onChange={(e) => update({ sort: e.target.value === "publish_date_desc" ? null : e.target.value })} className="rounded border bg-white px-2 py-1">
                {Object.entries(SORT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button key={c.label} onClick={() => update(c.clear)} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-900 hover:bg-blue-100">
                  {c.label} ✕
                </button>
              ))}
            </div>
          )}

          {notice && <p className="mt-3 rounded border border-green-300 bg-green-50 p-2 text-sm text-green-900">{notice}</p>}
          {error && <p className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

          <div className={`mt-3 space-y-3 ${loading ? "opacity-60" : ""}`}>
            {results?.results.map((t) => (
              <TenderCard key={t.bid_number} t={t} />
            ))}
            {!loading && results && results.total === 0 && (
              <p className="rounded-lg border bg-white p-6 text-center text-gray-600">
                No tenders match. Try another tab, fewer filters, or add keywords under Settings.
              </p>
            )}
          </div>

          {results && results.total > pageSize && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, true)} className="rounded border bg-white px-3 py-1.5 disabled:opacity-40">
                ← Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) }, true)} className="rounded border bg-white px-3 py-1.5 disabled:opacity-40">
                Next →
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
