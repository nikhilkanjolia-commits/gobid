import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { AuthButton } from "@/components/AuthButton";
import { NavTabs } from "@/components/NavTabs";
import { Wordmark } from "@/components/ui";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GoBid · Tender analysis for electrical contractors",
  description: "Check tender eligibility with page-cited evidence, price the BOQ from your supplier lists, and get a Go/No-Go before you bid.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-50 text-gray-900">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-2 sm:px-6 lg:h-16 lg:pt-0 lg:px-8">
            <Link href="/" className="rounded-lg py-2 text-lg text-blue-950 focus-visible:outline-2 focus-visible:outline-blue-600" aria-label="GoBid home">
              <Wordmark />
            </Link>
            <NavTabs />
            <div className="ml-auto py-2">
              <AuthButton />
            </div>
          </div>
        </header>
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
            <span>GoBid · AI reads, rules decide, you approve.</span>
            <span>Not affiliated with or approved by GeM. Always verify results against the tender before you bid.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
