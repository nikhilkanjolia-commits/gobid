import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NavTabs } from "@/components/NavTabs";
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
  title: "GoBid",
  description: "Tender eligibility check, priced BOQ and Go/No-Go for small electrical contractors",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <header className="sticky top-0 z-20 border-b bg-white">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-end gap-x-8 px-4 sm:px-8">
            <Link href="/" className="py-3 text-xl font-bold text-blue-800">
              GoBid
            </Link>
            <NavTabs />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
