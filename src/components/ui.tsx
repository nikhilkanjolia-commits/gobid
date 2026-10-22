// Shared look for GoBid: icons, buttons, cards and status badges. Plain Tailwind and inline
// SVG (no icon package). Colours: blue-600 #2563EB primary, blue-950 #172554 navy,
// blue-50 #EFF6FF surfaces, slate for text and borders.

import type { ReactNode, SVGProps } from "react";

const PATHS = {
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-2.9-13a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v-4m0-4h.01",
  minus: "M5 12h14",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M9 13h6m-6 4h6",
  sheet: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8m-8 4h8m-4-4v8",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m14-7-5-5-5 5m5-5v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  rupee: "M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 2-10 7L2 6",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  external: "M15 3h6v6m-11 5L21 3m-3 10v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  chevronDown: "m6 9 6 6 6-6",
  filter: "M22 3H2l8 9.5V19l4 2v-8.5L22 3Z",
  quote: "M3 21c3 0 7-1 7-8V5H3v8h4c0 4-2 6-4 6v2Zm11 0c3 0 7-1 7-8V5h-7v8h4c0 4-2 6-4 6v2Z",
  layers: "m12 2 10 5-10 5L2 7l10-5Zm-10 10 10 5 10-5M2 17l10 5 10-5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.5-1-2 3.5 2.1 1.6a7.4 7.4 0 0 0 0 2.4l-2.1 1.6 2 3.5 2.5-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.5 1 2-3.5-2.1-1.6c.1-.4.1-.8.1-1.2Z",
  spinner: "M21 12a9 9 0 1 1-6.2-8.6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-4 w-4", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${className} ${name === "spinner" ? "animate-spin" : ""}`}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

// Button looks, as class strings so they work on <button>, <a> and <Link>.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50";
export const btn = {
  primary: `${BASE} bg-blue-600 px-4 py-2.5 text-sm text-white shadow-sm hover:bg-blue-700`,
  primaryLg: `${BASE} bg-blue-600 px-5 py-3 text-base text-white shadow-sm hover:bg-blue-700`,
  secondary: `${BASE} border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50`,
  secondaryLg: `${BASE} border border-slate-200 bg-white px-5 py-3 text-base text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50`,
  ghost: `${BASE} px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900`,
  small: `${BASE} border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50`,
};

export const card = "rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
export const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20";

// Status tones: each has a colour and an icon, so status never depends on colour alone.
export type Tone = "good" | "bad" | "warn" | "neutral" | "info";
const TONE: Record<Tone, { cls: string; icon: IconName }> = {
  good: { cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", icon: "check" },
  bad: { cls: "bg-red-50 text-red-800 ring-red-600/20", icon: "x" },
  warn: { cls: "bg-amber-50 text-amber-900 ring-amber-600/25", icon: "help" },
  neutral: { cls: "bg-slate-100 text-slate-700 ring-slate-500/20", icon: "minus" },
  info: { cls: "bg-blue-50 text-blue-800 ring-blue-600/20", icon: "info" },
};

export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${t.cls}`}>
      <Icon name={t.icon} className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export const toneText: Record<Tone, string> = {
  good: "text-emerald-700",
  bad: "text-red-700",
  warn: "text-amber-700",
  neutral: "text-slate-600",
  info: "text-blue-700",
};

// A technical term with a plain-English explanation on hover or focus.
export const TERMS: Record<string, string> = {
  EMD: "Earnest Money Deposit: a refundable security amount paid with the bid.",
  MAF: "Manufacturer's Authorization Form: a letter from the OEM allowing you to quote their products for this tender.",
  OEM: "Original Equipment Manufacturer: the brand that makes the product (e.g. L&T, Schneider).",
  BOQ: "Bill of Quantities: the list of items, quantities and units the buyer wants priced.",
  MSE: "Micro and Small Enterprise (Udyam-registered): may be exempt from EMD or experience rules if the tender says so.",
  kA: "Breaking capacity in kiloamperes: the fault current a breaker can safely interrupt.",
  SKU: "Your supplier's product code for an item in the price list.",
  GeM: "Government e-Marketplace: India's public procurement portal.",
};

export function Term({ t, children }: { t: keyof typeof TERMS; children?: ReactNode }) {
  return (
    <abbr title={TERMS[t]} tabIndex={0} className="cursor-help underline decoration-slate-400 decoration-dotted underline-offset-2">
      {children ?? t}
    </abbr>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white">
        <Icon name="bolt" className="h-4 w-4" />
      </span>
      <span>
        Go<span className="text-blue-600">Bid</span>
      </span>
    </span>
  );
}
