import { Suspense } from "react";
import Analyzer from "@/components/Analyzer";

export const metadata = { title: "Analyze a tender · GoBid" };

// Only GeM document links are passed through to the page.
function gemLink(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^https:\/\/bidplus\.gem\.gov\.in\//.test(s) ? s : undefined;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function WithBid({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const bid = typeof sp.bid === "string" ? sp.bid.slice(0, 40) : undefined;
  return <Analyzer bid={bid} doc={gemLink(sp.doc)} />;
}

export default function AnalyzePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Analyzer />}>
      <WithBid searchParams={searchParams} />
    </Suspense>
  );
}
