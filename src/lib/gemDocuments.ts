import "server-only";
import { cacheLife } from "next/cache";
import { gemFilesFrom, isReadableBidDocument, type GemFile } from "@/lib/gemFiles";

const MAX_BYTES = 25 * 1024 * 1024;
const USER_AGENT = "GoBid/1.0 (tender research; reads public bid documents on request)";

export type BidFiles = { documentUrl: string; pageCount: number; files: GemFile[]; checkedAt: string };
export type BidFilesResult = ({ ok: true } & BidFiles) | { ok: false; error: string };

// Reads ONE public GeM bid document (the PDF GeM itself links from "All Bids"; allowed by
// bidplus robots.txt) and lists the files it links to. The attachments themselves are never
// downloaded here: the user's browser opens them from GeM. A good answer is cached for an
// hour per document, so repeated views don't hit GeM again; a failure only for a minute.
// Failures are returned, not thrown: a thrown error loses its message inside a cache.
export async function readBidFiles(documentUrl: string): Promise<BidFilesResult> {
  "use cache";
  try {
    const result = await fetchAndRead(documentUrl);
    cacheLife("hours");
    return { ok: true, ...result };
  } catch (e) {
    cacheLife("minutes");
    return { ok: false, error: (e as Error).message || "Unknown error" };
  }
}

async function fetchAndRead(documentUrl: string): Promise<BidFiles> {
  if (!isReadableBidDocument(documentUrl)) throw new Error("Not a GeM bid document link.");

  const res = await fetch(documentUrl, {
    headers: { "user-agent": USER_AGENT, accept: "application/pdf" },
    signal: AbortSignal.timeout(25_000),
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`GeM answered ${res.status} for the bid document.`);
  if (!/pdf/i.test(res.headers.get("content-type") ?? "")) throw new Error("GeM didn't send a PDF for this bid.");
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) throw new Error("The bid document is too large to read.");
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.byteLength > MAX_BYTES) throw new Error("The bid document is too large to read.");

  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (e) {
    throw new Error(`PDF reader failed to load: ${(e as Error).message}`);
  }
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await task.promise;
  const links: { url: string; page: number }[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      for (const a of await page.getAnnotations()) {
        if (a.subtype === "Link" && typeof a.url === "string") links.push({ url: a.url, page: p });
      }
    }
    return { documentUrl, pageCount: doc.numPages, files: gemFilesFrom(links), checkedAt: new Date().toISOString() };
  } finally {
    await task.destroy();
  }
}
