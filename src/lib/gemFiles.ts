// Turns the links inside a GeM bid document into a tidy list of the bid's files: the
// specification and BOQ uploads, the buyer's ATC, GeM's terms and so on. Plain functions, no
// network, so they are unit-tested (tests/gemFiles.test.ts).

export type GemFileKind = "spec" | "boq_items" | "atc" | "catalogue" | "om" | "gtc" | "attachment";

export type GemFile = { url: string; kind: GemFileKind; label: string; fileName: string | null; pages: number[] };

const KIND_ORDER: GemFileKind[] = ["spec", "boq_items", "atc", "catalogue", "attachment", "om", "gtc"];

const LABEL: Record<GemFileKind, string> = {
  spec: "Specification / BOQ document",
  boq_items: "BOQ line items (CSV)",
  atc: "Buyer’s ATC (Additional Terms & Conditions)",
  catalogue: "GeM category specification",
  attachment: "Buyer attachment",
  om: "Purchase-preference order (MII / MSE)",
  gtc: "GeM General Terms & Conditions",
};

// Only GeM's own bid documents are read on the server: never a URL from the browser.
const BID_DOCUMENT = /^https:\/\/bidplus\.gem\.gov\.in\/(showbidDocument|showradocumentPdf|showdirectradocumentPdf)\/\d+$/;
export function isReadableBidDocument(url: string | null | undefined) {
  return !!url && BID_DOCUMENT.test(url);
}

export const BID_NUMBER = /^GEM\/\d{4}\/[A-Z]\/\d{1,12}$/;

// Links must be https and on a gem.gov.in host; anything else in the PDF is ignored.
function gemUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    if (u.hostname !== "gem.gov.in" && !u.hostname.endsWith(".gem.gov.in")) return null;
    return u;
  } catch {
    return null;
  }
}

export function classifyGemLink(u: URL): GemFileKind | null {
  const p = u.pathname + u.search;
  if (/BoqLineItemsDocument/i.test(p)) return "boq_items";
  if (/BoqDocument/i.test(p)) return "spec";
  if (/ATCDOC|\/slafds/i.test(p)) return "atc";
  if (/\/showCatalogue\//i.test(p)) return "catalogue";
  if (/downloadOmppdfile/i.test(p)) return "om";
  if (/\/gtc\//i.test(p)) return "gtc";
  if (/uploaded_documents|fileDownloadPath|\.(pdf|csv|xlsx?|docx?|zip|jpe?g|png)$/i.test(p)) return "attachment";
  return null; // a GeM page, not a file
}

// "spec-2602001924___drawing_2026-10-22-15-53-55_5895d6….pdf" → "spec-2602001924___drawing.pdf"
export function fileNameOf(u: URL): string | null {
  const raw = u.searchParams.get("fileDownloadPath") ?? u.pathname;
  const last = decodeURIComponent(raw.split("/").filter(Boolean).pop() ?? "");
  if (!/\.[a-z0-9]{2,5}$/i.test(last)) return null;
  return last.replace(/_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}_[0-9a-f]{16,}(?=\.[a-z0-9]+$)/i, "");
}

// Links found in the PDF (one entry per link annotation, with its page) → the bid's files,
// one per distinct URL, in a useful order.
export function gemFilesFrom(links: { url: string; page: number }[]): GemFile[] {
  const byUrl = new Map<string, GemFile>();
  for (const { url, page } of links) {
    const u = gemUrl(url);
    if (!u) continue;
    const kind = classifyGemLink(u);
    if (!kind) continue;
    const key = u.toString();
    const existing = byUrl.get(key);
    if (existing) {
      if (!existing.pages.includes(page)) existing.pages.push(page);
      continue;
    }
    byUrl.set(key, { url: key, kind, label: LABEL[kind], fileName: kind === "gtc" || kind === "om" ? null : fileNameOf(u), pages: [page] });
  }
  return [...byUrl.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
