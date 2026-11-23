"use client";

import { useState } from "react";
import { Icon, btn, card, input } from "@/components/ui";

type Sent = { id: number; emailed: boolean; email: string };

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(["name", "email", "company", "message", "website"].map((k) => [k, String(form.get(k) ?? "")]));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({ error: "Something went wrong. Please try again." }));
      if (!res.ok) setError(data.error ?? "Something went wrong. Please try again.");
      else setSent({ id: data.id, emailed: !!data.emailed, email: body.email });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className={`${card} p-6`} role="status">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Icon name="check" className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Thanks, we got your message</h2>
        <p className="mt-1 text-sm text-slate-600">
          {sent.emailed ? (
            <>
              We’ve sent a confirmation to <b>{sent.email}</b>. Check your spam folder if you don’t see it.
            </>
          ) : (
            "We’ll get back to you by email soon."
          )}
          {sent.id ? ` Reference #${sent.id}.` : ""}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-4 p-6`} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-800">
            Your name
          </label>
          <input id="name" name="name" required maxLength={80} autoComplete="name" className={input} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-800">
            Email
          </label>
          <input id="email" name="email" type="email" required maxLength={120} autoComplete="email" placeholder="you@company.in" className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="company" className="mb-1.5 block text-sm font-medium text-slate-800">
          Company <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input id="company" name="company" maxLength={120} autoComplete="organization" className={input} />
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-slate-800">
          Message
        </label>
        <textarea id="message" name="message" required minLength={10} maxLength={3000} rows={5} placeholder="How can we help?" className={input} />
      </div>
      {/* Hidden from people; bots that fill every field give themselves away. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      <button disabled={busy} className={`${btn.primary} w-full sm:w-auto`}>
        {busy ? <Icon name="spinner" /> : <Icon name="mail" />}
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
