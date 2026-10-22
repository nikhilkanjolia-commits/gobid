"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authHeaders, supabaseBrowser } from "@/lib/supabaseBrowser";
import type { SearchKeyword } from "@/lib/tenderQuery";

type Alerts = { email: string; categories: string[]; keywords: string[]; enabled: boolean; last_sent_at: string | null };

// Signed-in users choose which categories (and optional keywords) their daily email covers.
export function AlertsSettings() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [all, setAll] = useState<SearchKeyword[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const session = (await sb?.auth.getSession())?.data.session;
      setSignedIn(!!session);
      const kw = await fetch("/api/keywords").then((r) => (r.ok ? r.json() : []));
      setAll(kw);
      if (!session) return;
      const r = await fetch("/api/me/alerts", { headers: await authHeaders() });
      const data = await r.json().catch(() => null);
      if (r.ok) setAlerts(data);
      else setNote({ ok: false, text: data?.error ?? "Couldn't load your alerts." });
    })();
  }, []);

  if (signedIn === null) return <p className="text-gray-600">Loading…</p>;
  if (!signedIn) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <p>Sign in with your email to get a daily update with new GeM tenders in the categories you choose.</p>
        <Link href="/login" className="mt-4 inline-block rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
          Sign in with email
        </Link>
      </div>
    );
  }
  if (!alerts) return <p className="text-gray-600">{note?.text ?? "Loading your alerts…"}</p>;

  const categories = Array.from(new Set(all.map((k) => k.category))).sort();
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const nothingChosen = alerts.categories.length === 0 && alerts.keywords.length === 0;

  async function save() {
    setBusy(true);
    setNote(null);
    const r = await fetch("/api/me/alerts", {
      method: "PUT",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ categories: alerts!.categories, keywords: alerts!.keywords, enabled: alerts!.enabled }),
    });
    const data = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) {
      setNote({ ok: false, text: data?.error ?? "Couldn't save." });
      return;
    }
    setNote({
      ok: true,
      text: !alerts!.enabled
        ? "Saved. Daily emails are off."
        : nothingChosen
          ? "Saved, but choose at least one category or keyword to get emails."
          : `Saved. You'll get an email at about 8:00 AM (India time) when there are new or closing tenders for you.`,
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Daily email</h2>
            <p className="text-sm text-gray-600">
              Sent to <span className="font-medium">{alerts.email}</span> at about 8:00 AM India time.
              {alerts.last_sent_at ? ` Last sent ${new Date(alerts.last_sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}.` : ""}
            </p>
          </div>
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={alerts.enabled} onChange={() => setAlerts({ ...alerts, enabled: !alerts.enabled })} className="h-5 w-5" />
            {alerts.enabled ? "On" : "Off"}
          </label>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Each email lists tenders that are new since the last email, plus tenders closing within 3 days. If there&apos;s nothing for you that day, no email is sent.
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold">Categories</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setAlerts({ ...alerts, categories: toggle(alerts.categories, c) })}
              aria-pressed={alerts.categories.includes(c)}
              className={`rounded-full border px-3 py-1.5 text-sm ${alerts.categories.includes(c) ? "border-blue-700 bg-blue-700 text-white" : "bg-white hover:bg-gray-50"}`}
            >
              {c}
            </button>
          ))}
        </div>

        <details className="mt-4" open={alerts.keywords.length > 0}>
          <summary className="cursor-pointer text-sm font-semibold">Only specific keywords (optional)</summary>
          <p className="mt-1 text-xs text-gray-500">Add keywords from categories you didn&apos;t pick, e.g. just “MCCB” without all of Switchgear.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {all.map((k) => (
              <button
                key={k.keyword}
                onClick={() => setAlerts({ ...alerts, keywords: toggle(alerts.keywords, k.keyword) })}
                aria-pressed={alerts.keywords.includes(k.keyword)}
                className={`rounded-full border px-3 py-1 text-xs ${alerts.keywords.includes(k.keyword) ? "border-gray-900 bg-gray-900 text-white" : "bg-white hover:bg-gray-50"}`}
              >
                {k.keyword}
              </button>
            ))}
          </div>
        </details>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} onClick={save} className="rounded bg-blue-700 px-5 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save email alerts"}
        </button>
        {note && <span className={`text-sm ${note.ok ? "text-green-800" : "text-red-700"}`}>{note.text}</span>}
      </div>
    </div>
  );
}
