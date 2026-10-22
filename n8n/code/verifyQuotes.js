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

// Units as printed in BOQs, followed by the quantity: "Nos | 120", "Mtr 600", "Set: 1".
const UNIT_QTY = /(?:^|[\s|:,])(nos?|numbers?|each|sets?|mtrs?|metres?|meters?|rmt|rm|m|kg|lot|job|sqm|cum|ltrs?|pairs?)\.?\s*[|:]?\s*(\d[\d,]*(?:\.\d+)?)(?![\d.]*\s*(?:mm|sq|kv|ka|w|a)\b)/i;

// Same normalization as normalizeForQuote, plus where each normalized character came from in
// the raw text, so a quote found in normalized text can be located in the original.
function normalizeWithMap(text) {
  const raw = String(text || "");
  let norm = "";
  const map = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = normalizeForQuote(raw[i]);
    if (ch) {
      norm += ch;
      map.push(i);
    } else if (norm && norm[norm.length - 1] !== " ") {
      norm += " ";
      map.push(i);
    }
  }
  return { norm: norm, map: map };
}

// Plain-code reading of a verified BOQ line: finds where the AI's quote sits on the page and
// reads the unit and quantity printed right after the description. Short quotes can start
// several lines ("LT XLPE ... cable 3.5 core"), so each place is scored by how well the printed
// description after it matches the AI's full description; a tie means we can't tell, and
// nothing is read. Returns null if the line can't be pinned down or has no unit + number.
function readBoqLine(pageText, quote, description) {
  const q = normalizeForQuote(quote);
  if (!q) return null;
  const raw = String(pageText);
  const { norm, map } = normalizeWithMap(raw);
  const wanted = new Set(normalizeForQuote(description || quote).split(" "));
  const found = [];
  for (let at = norm.indexOf(q); at >= 0; at = norm.indexOf(q, at + 1)) {
    // Whole words only ("6a" must not match inside "16a").
    if (at > 0 && norm[at - 1] !== " ") continue;
    const end = map[at + q.length - 1] + 1;
    const m = raw.slice(end, end + 250).match(UNIT_QTY);
    if (!m) continue;
    const between = normalizeForQuote(raw.slice(end, end + m.index)).split(" ").filter(Boolean);
    const score = between.filter((w) => wanted.has(w)).length - between.filter((w) => !wanted.has(w)).length;
    found.push({ score: score, unit: m[1], qty: Number(m[2].replace(/,/g, "")) });
  }
  if (found.length === 0) return null;
  found.sort((a, b) => b.score - a.score);
  if (found.length > 1 && found[0].score === found[1].score && found[0].qty !== found[1].qty) return null;
  return { unit: found[0].unit, qty: found[0].qty };
}

// For each verified BOQ row: fill a missing quantity/unit from the printed line, and mark a
// row whose AI quantity disagrees with the page (kept for checkMatches to flag red).
function readBoqLines(pages, rows) {
  const byPage = new Map(pages.map((p) => [p.page, p.text]));
  return (rows || []).map((r) => {
    if (!r.verified) return r;
    const text = (byPage.get(r.page) || "") + "\n" + (byPage.get(r.page + 1) || "");
    const printed = readBoqLine(text, r.quote, r.description);
    if (!printed) return r;
    const out = Object.assign({}, r);
    if (out.qty == null) out.qty = printed.qty;
    else if (Math.abs(out.qty - printed.qty) > 1e-9) out.qtyMismatch = printed.qty;
    if (!out.unit) out.unit = printed.unit;
    return out;
  });
}

// Adds `verified` and `verifyNote` to each item that has { page, quote }.
function verifyQuotes(pages, items) {
  return (items || []).map((item) => {
    const check = verifyQuote(pages, item.page, item.quote);
    return Object.assign({}, item, { verified: check.verified, verifyNote: check.note });
  });
}
