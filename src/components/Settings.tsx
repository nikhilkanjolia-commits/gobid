"use client";

import { useEffect, useState } from "react";
import { clearPrefs, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";
import type { SearchKeyword } from "@/lib/tenderQuery";

const SORTS: [string, string][] = [
  ["publish_date_desc", "Newest published"],
  ["closing_date_asc", "Closing soonest"],
  ["closing_date_desc", "Closing latest"],
  ["first_seen_desc", "Newest on GoBid"],
];
const PASSCODE_KEY = "gobid.admin";
const MAX_ENABLED = 40;

export function Settings() {
  const [keywords, setKeywords] = useState<SearchKeyword[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<Prefs>({ category: [], keyword: [] });
  const [prefsNote, setPrefsNote] = useState<string | null>(null);

  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminNote, setAdminNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState({ keyword: "", category: "", newCategory: "", pages: 2 });

  async function loadKeywords() {
    const r = await fetch("/api/keywords");
    const data = await r.json().catch(() => null);
    if (!r.ok) setLoadError(data?.error ?? "Couldn't load keywords.");
    else setKeywords(data);
  }

  // Load the keyword list, then this browser's saved preferences and passcode.
  useEffect(() => {
    (async () => {
      await loadKeywords();
      setPrefs(loadPrefs() ?? { category: [], keyword: [] });
      try {
        setPasscode(sessionStorage.getItem(PASSCODE_KEY) ?? "");
      } catch {
        // Storage blocked: the passcode is asked for each time.
      }
    })();
  }, []);

  const categories = Array.from(new Set((keywords ?? []).map((k) => k.category))).sort();
  const enabledCount = (keywords ?? []).filter((k) => k.enabled).length;
  const requestsPerRun = (keywords ?? []).filter((k) => k.enabled).reduce((s, k) => s + k.pages, 0) + 1;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // Sends one keyword change with the admin passcode, then reloads the list.
  async function change(method: "POST" | "DELETE", body?: SearchKeyword, keyword?: string) {
    if (!passcode) {
      setAdminNote({ ok: false, text: "Enter the admin passcode first." });
      return false;
    }
    setBusy(true);
    setAdminNote(null);
    try {
      const url = method === "DELETE" ? `/api/keywords?keyword=${encodeURIComponent(keyword!)}` : "/api/keywords";
      const r = await fetch(url, {
        method,
        headers: { "content-type": "application/json", "x-gobid-admin": passcode },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        setAdminNote({ ok: false, text: data?.error ?? "That didn't work." });
        return false;
      }
      try {
        sessionStorage.setItem(PASSCODE_KEY, passcode);
      } catch {
        // Not remembered; that's fine.
      }
      await loadKeywords();
      setAdminNote({ ok: true, text: "Saved. The next hourly collection will use it." });
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    const category = (draft.category === "__new" ? draft.newCategory : draft.category).trim();
    if (!draft.keyword.trim() || !category) {
      setAdminNote({ ok: false, text: "Type a keyword and choose or type a category." });
      return;
    }
    if (enabledCount >= MAX_ENABLED) {
      setAdminNote({ ok: false, text: `At most ${MAX_ENABLED} keywords can be on. Turn one off first.` });
      return;
    }
    if (await change("POST", { keyword: draft.keyword.trim(), category, enabled: true, pages: draft.pages })) {
      setDraft({ keyword: "", category: "", newCategory: "", pages: 2 });
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold">My preferences</h2>
        <p className="text-sm text-gray-600">
          The filters the Tenders page opens with. Saved in this browser only. You can also set filters on the Tenders page and click
          “Save as my preferences”.
        </p>

        <h3 className="mt-4 text-sm font-semibold">Categories I follow</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setPrefs({ ...prefs, category: toggle(prefs.category, c) })}
              className={`rounded-full border px-3 py-1 text-sm ${prefs.category.includes(c) ? "border-blue-700 bg-blue-700 text-white" : "bg-white hover:bg-gray-50"}`}
              aria-pressed={prefs.category.includes(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <h3 className="mt-4 text-sm font-semibold">Keywords I follow (optional)</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {(keywords ?? [])
            .filter((k) => !prefs.category.length || prefs.category.includes(k.category))
            .map((k) => (
              <button
                key={k.keyword}
                onClick={() => setPrefs({ ...prefs, keyword: toggle(prefs.keyword, k.keyword) })}
                className={`rounded-full border px-3 py-1 text-xs ${prefs.keyword.includes(k.keyword) ? "border-gray-900 bg-gray-900 text-white" : "bg-white hover:bg-gray-50"}`}
                aria-pressed={prefs.keyword.includes(k.keyword)}
              >
                {k.keyword}
              </button>
            ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            <span className="font-semibold">Ministry contains</span>
            <input value={prefs.ministry ?? ""} onChange={(e) => setPrefs({ ...prefs, ministry: e.target.value || undefined })} placeholder="e.g. Railways" className="mt-1 w-full rounded border px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="font-semibold">Sort by</span>
            <select value={prefs.sort ?? "publish_date_desc"} onChange={(e) => setPrefs({ ...prefs, sort: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5">
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-semibold">Tenders per page</span>
            <select value={prefs.page_size ?? 20} onChange={(e) => setPrefs({ ...prefs, page_size: Number(e.target.value) })} className="mt-1 w-full rounded border bg-white px-2 py-1.5">
              {[10, 20, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPrefsNote(savePrefs(prefs) ? "Saved. Open Tenders to see them applied." : "Couldn't save: this browser blocks storage.")}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Save preferences
          </button>
          <button
            onClick={() => {
              clearPrefs();
              setPrefs({ category: [], keyword: [] });
              setPrefsNote("Cleared. Tenders will open with no filters.");
            }}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Clear
          </button>
          {prefsNote && <span className="text-sm text-green-800">{prefsNote}</span>}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold">What GoBid collects from GeM</h2>
        <p className="text-sm text-gray-600">
          Every hour, GoBid searches GeM for each keyword that&apos;s on and saves the newest bids (10 per page). Categories group keywords in the
          filters. {keywords && `${enabledCount} of ${MAX_ENABLED} keywords on · about ${requestsPerRun} GeM requests and ${Math.round((requestsPerRun * 2.3) / 60 + 0.5)} min per run.`}
        </p>

        <label className="mt-4 block max-w-sm text-sm">
          <span className="font-semibold">Admin passcode</span> <span className="text-gray-500">(needed to change this list)</span>
          <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="off" className="mt-1 w-full rounded border px-2 py-1.5" />
        </label>

        {adminNote && <p className={`mt-3 rounded border p-2 text-sm ${adminNote.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-800"}`}>{adminNote.text}</p>}
        {loadError && <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{loadError}</p>}

        <form onSubmit={addKeyword} className="mt-4 grid gap-2 rounded border bg-gray-50 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="text-sm">
            New keyword
            <input value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} placeholder="e.g. battery" className="mt-1 w-full rounded border bg-white px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Category
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5">
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option value="__new">+ New category…</option>
            </select>
            {draft.category === "__new" && (
              <input value={draft.newCategory} onChange={(e) => setDraft({ ...draft, newCategory: e.target.value })} placeholder="New category name" className="mt-1 w-full rounded border bg-white px-2 py-1.5" />
            )}
          </label>
          <label className="text-sm">
            Pages
            <select value={draft.pages} onChange={(e) => setDraft({ ...draft, pages: Number(e.target.value) })} className="mt-1 w-full rounded border bg-white px-2 py-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            Add
          </button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-gray-600">
              <tr>
                <th className="py-2 pr-3">Keyword</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Pages</th>
                <th className="py-2 pr-3">Collect</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(keywords ?? []).map((k) => (
                <tr key={k.keyword} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{k.keyword}</td>
                  <td className="py-2 pr-3">{k.category}</td>
                  <td className="py-2 pr-3">
                    <select value={k.pages} disabled={busy} onChange={(e) => change("POST", { ...k, pages: Number(e.target.value) })} className="rounded border bg-white px-1 py-0.5" aria-label={`Pages for ${k.keyword}`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={k.enabled} disabled={busy} onChange={() => change("POST", { ...k, enabled: !k.enabled })} />
                      {k.enabled ? "On" : "Off"}
                    </label>
                  </td>
                  <td className="py-2 text-right">
                    <button disabled={busy} onClick={() => change("DELETE", undefined, k.keyword)} className="text-xs text-red-700 hover:underline disabled:opacity-50">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
