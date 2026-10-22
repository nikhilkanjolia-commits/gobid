"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btn } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

// Header corner: "Sign in", or the signed-in email with "Sign out".
export function AuthButton() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data } = sb.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!email) {
    return (
      <Link href="/login" className={btn.secondary.replace("py-2.5", "py-2")}>
        Sign in
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="hidden items-center gap-2 text-slate-600 sm:flex" title={email}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-xs font-semibold uppercase text-blue-700" aria-hidden="true">
          {email[0]}
        </span>
        <span className="max-w-44 truncate">{email}</span>
      </span>
      <button
        onClick={async () => {
          await supabaseBrowser()?.auth.signOut();
          router.push("/");
        }}
        className={btn.ghost}
      >
        Sign out
      </button>
    </span>
  );
}
