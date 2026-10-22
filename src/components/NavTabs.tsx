"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Tenders" },
  { href: "/analyze", label: "Analyze a tender" },
  { href: "/settings", label: "Settings" },
];

// The tabs across the top of every page.
export function NavTabs() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar -mb-px flex gap-1 overflow-x-auto" aria-label="Main">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${
              active ? "border-blue-700 text-blue-800" : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
