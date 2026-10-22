import { Suspense } from "react";
import { AnalyzerFromUrl } from "@/components/AnalyzerFromUrl";

export const metadata = { title: "Analyse a tender · GoBid" };

export default function AnalyzePage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-7xl px-4 py-8 text-slate-500 sm:px-6 lg:px-8">Loading…</p>}>
      <AnalyzerFromUrl />
    </Suspense>
  );
}
