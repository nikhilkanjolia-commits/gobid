// Checks that every quote the AI gave really appears on the page it cited.
// Plain script: pasted as-is into an n8n Code node and loaded the same way by the tests.

// Lowercase, unify quote marks and dashes, keep only letters/digits as space-separated words.
function normalizeForQuote(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9ऀ-ॿ]+/g, " ")
    .trim();
}

function wordTrigrams(words) {
  const grams = new Set();
  for (let i = 0; i + 2 < words.length; i++) grams.add(words[i] + " " + words[i + 1] + " " + words[i + 2]);
  return grams;
}

// True when the quote is on the page: exact match after normalizing, or (for quotes of
// 6+ words) at least 90% of the quote's word triples appear on the page.
function quoteOnText(quote, pageText) {
  const q = normalizeForQuote(quote);
  const p = normalizeForQuote(pageText);
  if (!q || !p) return false;
  if (p.includes(q)) return true;
  const qWords = q.split(" ");
  if (qWords.length < 6) return false;
  const qGrams = wordTrigrams(qWords);
  const pGrams = wordTrigrams(p.split(" "));
  let hits = 0;
  qGrams.forEach((g) => { if (pGrams.has(g)) hits++; });
  return hits / qGrams.size >= 0.9;
}

// pages: [{ page, text }]. Returns { verified, note }.
// A quote that runs over a page break may span the cited page and the next one.
function verifyQuote(pages, page, quote) {
  if (page == null || !quote || !String(quote).trim()) {
    return { verified: false, note: "No page or quote given" };
  }
  const byPage = new Map(pages.map((p) => [p.page, p.text]));
  if (!byPage.has(page)) return { verified: false, note: "Page " + page + " does not exist in this PDF" };
  const here = byPage.get(page);
  const next = byPage.get(page + 1) || "";
  if (quoteOnText(quote, here)) return { verified: true, note: null };
  // Spanning counts only if the quote really crosses the break, not if it's wholly on the next page.
  if (quoteOnText(quote, here + " " + next) && !quoteOnText(quote, next)) return { verified: true, note: null };
  for (const p of pages) {
    if (p.page !== page && quoteOnText(quote, p.text)) {
      return { verified: false, note: "Quote is on page " + p.page + ", not page " + page };
    }
  }
  return { verified: false, note: "Quote not found on page " + page };
}

// Adds `verified` and `verifyNote` to each item that has { page, quote }.
function verifyQuotes(pages, items) {
  return (items || []).map((item) => {
    const check = verifyQuote(pages, item.page, item.quote);
    return Object.assign({}, item, { verified: check.verified, verifyNote: check.note });
  });
}
