// Turns the tender PDF into text, page by page, in the browser. Knowing exactly which page
// each line came from is what lets the quote check prove the AI's citations.

export type PageText = { page: number; text: string };

export type PdfResult = { ok: true; pages: PageText[] } | { ok: false; error: string };

// A page with fewer letters than this is treated as an image (scanned) page.
const MIN_CHARS_PER_PAGE = 40;
// If more than this share of pages look scanned, we refuse the file (OCR is out of scope).
const MAX_SCANNED_SHARE = 0.3;

// Plain check on already-extracted pages; kept separate so it can be unit-tested.
export function checkPages(pages: PageText[]): PdfResult {
  if (pages.length === 0) return { ok: false, error: "This PDF has no pages." };
  const scanned = pages.filter((p) => p.text.replace(/\s+/g, "").length < MIN_CHARS_PER_PAGE).length;
  if (scanned === pages.length) {
    return { ok: false, error: "This PDF has no readable text; it looks scanned. GoBid only reads text PDFs for now." };
  }
  if (scanned / pages.length > MAX_SCANNED_SHARE) {
    return {
      ok: false,
      error: `${scanned} of ${pages.length} pages have no readable text; the PDF looks scanned. GoBid only reads text PDFs for now.`,
    };
  }
  return { ok: true, pages };
}

export async function extractPdfText(file: File): Promise<PdfResult> {
  if (file.size === 0) return { ok: false, error: "The PDF file is empty." };
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== "%PDF-") {
    return { ok: false, error: `"${file.name}" is not a PDF file.` };
  }

  // Loaded only in the browser, when a file is picked.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") return { ok: false, error: "This PDF is password-protected. Remove the password and upload it again." };
    if (name === "InvalidPDFException") return { ok: false, error: "This PDF is damaged and can't be opened." };
    return { ok: false, error: `Can't open this PDF: ${(e as Error)?.message ?? "unknown error"}` };
  }

  const pages: PageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push({ page: n, text: text.replace(/[ \t]+/g, " ").trim() });
  }
  await task.destroy();
  return checkPages(pages);
}
