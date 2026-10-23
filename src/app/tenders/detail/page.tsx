import { Suspense } from "react";
import { TenderDetail } from "@/components/TenderDetail";

export const metadata = { title: "Tender details · GoBid" };

export default function TenderDetailPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-5xl px-4 py-8 text-slate-500 sm:px-6 lg:px-8">Loading tender…</p>}>
      <TenderDetail />
    </Suspense>
  );
}
