import { Suspense } from "react";
import { AnalyzerFromUrl } from "@/components/AnalyzerFromUrl";

export const metadata = { title: "Analyze a tender · GoBid" };

export default function AnalyzePage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-6xl p-4 text-gray-600 sm:p-8">Loading…</p>}>
      <AnalyzerFromUrl />
    </Suspense>
  );
}
