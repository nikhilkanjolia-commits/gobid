"use client";

import { useSearchParams } from "next/navigation";
import Analyzer from "@/components/Analyzer";

// Reads ?bid= and ?doc= (set by a tender card's "Analyze" button) in the browser and opens
// the analyzer for that bid. Only GeM document links are passed through.
export function AnalyzerFromUrl() {
  const params = useSearchParams();
  const bid = params.get("bid")?.slice(0, 40) || undefined;
  const doc = params.get("doc") ?? "";
  return <Analyzer bid={bid} doc={/^https:\/\/bidplus\.gem\.gov\.in\//.test(doc) ? doc : undefined} />;
}
