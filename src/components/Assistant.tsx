"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";

// The "Ask GoBid" help chat: a button in the bottom-right corner of every page that opens a
// small chat panel. Answers come from /api/assistant. The conversation is kept only in this
// browser tab (sessionStorage) and is never saved on the server.

type Msg = { role: "user" | "assistant"; text: string };

const STORE = "gobid-assistant";
const SUGGESTIONS = ["How do I analyse a tender?", "What files do I need to upload?", "How do daily email alerts work?", "What is EMD and MAF?"];
const WELCOME: Msg = {
  role: "assistant",
  text: "Hi! I'm GoBid's assistant. Ask me how GoBid works or about GeM tender terms. I can't see your files or a specific tender, and I can make mistakes, so check important details yourself.",
};

// Turns site paths like /analyze into links and drops markdown stars.
const LINKABLE = /(\/(?:analyze|tenders|alerts|settings|contact|login)\b)/g;
function Rich({ text }: { text: string }) {
  return (
    <>
      {text
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .split(LINKABLE)
        .map((part, i) =>
          i % 2 === 1 ? (
            <Link key={i} href={part} className="font-medium text-blue-700 underline underline-offset-2">
              {part}
            </Link>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          ),
        )}
    </>
  );
}

function loadSaved(): Msg[] {
  try {
    if (typeof window === "undefined") return [];
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "[]");
    return Array.isArray(saved) ? saved.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string") : [];
  } catch {
    return [];
  }
}

export function Assistant() {
  const [open, setOpen] = useState(false);
  // Read lazily: the panel starts closed, so the server render never shows these messages.
  const [messages, setMessages] = useState<Msg[]>(loadSaved);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30)));
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, error]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    // An unanswered question goes back into the box so it can simply be sent again.
    const fail = (message: string) => {
      setMessages(messages);
      setDraft(text);
      setError(message);
    };
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.reply) setMessages([...next, { role: "assistant", text: data.reply }]);
      else fail(data.error ?? "Something went wrong. Please try again.");
    } catch {
      fail("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Ask GoBid"
          className="fixed inset-x-3 bottom-20 z-40 flex max-h-[min(36rem,calc(100dvh-7rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:w-96"
        >
          <header className="flex items-center gap-3 border-b border-slate-200 bg-blue-950 px-4 py-3 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600">
              <Icon name="chat" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Ask GoBid</h2>
              <p className="text-xs text-blue-200">AI assistant · answers about GoBid and GeM tenders</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                className="rounded-md px-2 py-1 text-xs text-blue-100 hover:bg-white/10"
              >
                New chat
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-md p-1 text-blue-100 hover:bg-white/10">
              <Icon name="x" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            {[WELCOME, ...messages].map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 leading-relaxed ${
                    m.role === "user" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.role === "assistant" ? <Rich text={m.text} /> : m.text}
                </p>
              </div>
            ))}

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 hover:bg-blue-100">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {busy && (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Icon name="spinner" className="h-3.5 w-3.5" /> Thinking…
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Rich text={error} />
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="flex items-end gap-2 border-t border-slate-200 p-3"
          >
            <label htmlFor="assistant-input" className="sr-only">
              Your question
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              rows={1}
              maxLength={1000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              placeholder="Type your question…"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Icon name="send" />
            </button>
          </form>
          <p className="px-3 pb-2 text-center text-[11px] text-slate-400">
            Not answered?{" "}
            <Link href="/contact" className="text-blue-700 hover:underline">
              Contact the team
            </Link>
          </p>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Ask GoBid: open the help chat"}
        className="fixed bottom-4 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-medium text-white shadow-lg hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:right-6"
      >
        <Icon name={open ? "x" : "chat"} className="h-5 w-5" />
        <span className="hidden sm:inline">{open ? "Close" : "Ask GoBid"}</span>
      </button>
    </>
  );
}
