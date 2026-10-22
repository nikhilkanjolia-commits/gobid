"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, btn, card, input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

// Sign in or sign up by email: no passwords. Step 1 emails a 6-digit code and a sign-in link;
// step 2 checks the code (or the user clicks the link). New emails get an account automatically.
export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const sb = supabaseBrowser();

  if (!sb) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Sign-in isn&apos;t set up yet: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.</p>;
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setMessage({ ok: false, text: "That doesn't look like an email address." });
      return;
    }
    setBusy(true);
    setMessage(null);
    // The email has a 6-digit code (once the GoBid email template is set up) and a sign-in link;
    // the link brings the user back to their alert settings, already signed in.
    const { error } = await sb!.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/alerts` },
    });
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error.message.includes("rate") ? "Too many codes sent. Wait a minute and try again." : `Couldn't send the code: ${error.message}` });
      return;
    }
    setEmail(clean);
    setStep("code");
    setMessage({
      ok: true,
      text: `We emailed ${clean}. Type the 6-digit code here, or just click the sign-in link in the email. Check spam if you don't see it.`,
    });
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await sb!.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: "That code is wrong or has expired. Check it, or send a new one." });
      return;
    }
    router.push("/alerts");
  }

  return (
    <div className={`${card} p-6`}>
      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.in"
              aria-invalid={message ? !message.ok : undefined}
              aria-describedby={message ? "login-message" : undefined}
              className={input}
              required
            />
          </div>
          <button disabled={busy} className={`${btn.primary} w-full`}>
            {busy && <Icon name="spinner" />}
            {busy ? "Sending code…" : "Email me a sign-in code"}
          </button>
          <p className="text-xs text-slate-500">New here? The same step creates your account.</p>
        </form>
      ) : (
        <form onSubmit={checkCode} className="space-y-4">
          <label className="block text-sm font-medium text-slate-800" htmlFor="code">
            6-digit code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            aria-describedby={message ? "login-message" : undefined}
            className={`${input} text-center font-mono text-xl tracking-[0.4em]`}
            required
          />
          <button disabled={busy || code.length < 6} className={`${btn.primary} w-full`}>
            {busy && <Icon name="spinner" />}
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setMessage(null);
            }}
            className="w-full rounded text-sm text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Use a different email, or send a new code
          </button>
        </form>
      )}
      {message && (
        <p id="login-message" role={message.ok ? "status" : "alert"} className={`mt-4 flex gap-2 rounded-lg border p-3 text-sm ${message.ok ? "border-blue-200 bg-blue-50 text-blue-900" : "border-red-200 bg-red-50 text-red-800"}`}>
          <Icon name={message.ok ? "mail" : "alert"} className="mt-0.5 h-4 w-4 shrink-0" />
          {message.text}
        </p>
      )}
    </div>
  );
}
