"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
      <Link href="/login" className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800">
        Sign in
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="hidden max-w-48 truncate text-gray-600 sm:inline" title={email}>
        {email}
      </span>
      <button
        onClick={async () => {
          await supabaseBrowser()?.auth.signOut();
          router.push("/");
        }}
        className="rounded border px-3 py-1.5 hover:bg-gray-50"
      >
        Sign out
      </button>
    </span>
  );
}
