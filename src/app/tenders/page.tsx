import { Suspense } from "react";
import { TendersBrowser } from "@/components/TendersBrowser";

export const metadata = { title: "GeM tenders · GoBid" };

export default function TendersPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-7xl px-4 py-8 text-slate-500 sm:px-6 lg:px-8">Loading tenders…</p>}>
      <TendersBrowser />
    </Suspense>
  );
}
