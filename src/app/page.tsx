import { Suspense } from "react";
import { TendersBrowser } from "@/components/TendersBrowser";

export default function TendersPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-7xl px-4 py-6 text-gray-600 sm:px-8">Loading tenders…</p>}>
      <TendersBrowser />
    </Suspense>
  );
}
