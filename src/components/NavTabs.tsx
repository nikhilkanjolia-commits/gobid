"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/analyze", label: "Analyse tender" },
  { href: "/tenders", label: "GeM tenders" },
  { href: "/alerts", label: "Email alerts" },
  { href: "/settings", label: "Settings" },
];

// The links across the top of every page.
export function NavTabs() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar order-last -mx-1 flex w-full gap-1 overflow-x-auto pb-2 lg:order-none lg:mx-0 lg:w-auto lg:pb-0" aria-label="Main">
      {TABS.map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
