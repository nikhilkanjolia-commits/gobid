"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
    return <p className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900">Sign-in isn&apos;t set up yet: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.</p>;
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
    <div className="rounded-lg border bg-white p-6">
      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">
            Email address
          </label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.in" className="w-full rounded border px-3 py-2" required />
          <button disabled={busy} className="w-full rounded bg-blue-700 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {busy ? "Sending…" : "Send me a code"}
          </button>
          <p className="text-xs text-gray-500">New here? The same step creates your account.</p>
        </form>
      ) : (
        <form onSubmit={checkCode} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="code">
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
            className="w-full rounded border px-3 py-2 text-center text-xl tracking-widest"
            required
          />
          <button disabled={busy || code.length < 6} className="w-full rounded bg-blue-700 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setMessage(null);
            }}
            className="w-full text-sm text-blue-800 hover:underline"
          >
            Use a different email, or send a new code
          </button>
        </form>
      )}
      {message && <p className={`mt-3 rounded border p-2 text-sm ${message.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-800"}`}>{message.text}</p>}
    </div>
  );
}
