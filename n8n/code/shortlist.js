// Picks up to 15 likely SKUs for each BOQ line, by shared words and ratings.
// The AI then chooses only among these real SKUs, so it can't invent one.

const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with",
  "supply", "supplying", "installation", "installing", "fixing", "providing", "including", "complete",
  "type", "make", "approved", "suitable", "etc", "nos", "no", "mtr", "meter", "metre", "set", "each",
]);

// Turns "63 A", "10 kA", "2.5 sq.mm", "4 core", "FP" into compact tokens: 63a, 10ka, 2.5sqmm, 4c, 4p.
function specTokens(text) {
  let t = " " + String(text || "").toLowerCase() + " ";
  t = t
    .replace(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*mm|sqmm|mm2|mm²|sq\s*mm)/g, " $1sqmm ")
    .replace(/(\d+(?:\.\d+)?)\s*ka\b/g, " $1ka ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:amps?|a)\b/g, " $1a ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:cores?|c)\b/g, " $1c ")
    .replace(/(\d)\s*(?:poles?|p)\b/g, " $1p ")
    .replace(/\bsp\b/g, " 1p ")
    .replace(/\bdp\b/g, " 2p ")
    .replace(/\btp\b/g, " 3p ")
    .replace(/\bfp\b/g, " 4p ")
    .replace(/(\d+(?:\.\d+)?)\s*w\b/g, " $1w ")
    .replace(/(\d+(?:\.\d+)?)\s*kv\b/g, " $1kv ");
  return t
    .split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w && !STOP_WORDS.has(w));
}

function tokenWeight(token) {
  return /\d/.test(token) ? 3 : 1;
}

// boqRows: [{ item, description, ... }]. priceRows: [{ sku, description, brand, ... }].
// Returns [{ item, candidates: [{ sku, description, brand, unit, score }] }].
function shortlistSkus(boqRows, priceRows, limit) {
  const max = limit || 15;
  const indexed = (priceRows || []).map((p) => ({
    p: p,
    tokens: new Set(specTokens(p.description + " " + (p.brand || ""))),
  }));
  return (boqRows || []).map((r) => {
    const want = Array.from(new Set(specTokens(r.description)));
    const scored = [];
    for (const it of indexed) {
      let score = 0;
      for (const w of want) if (it.tokens.has(w)) score += tokenWeight(w);
      if (score > 0) scored.push({ p: it.p, score: score });
    }
    scored.sort((a, b) => b.score - a.score);
    return {
      item: r.item,
      candidates: scored.slice(0, max).map((s) => ({
        sku: s.p.sku,
        description: s.p.description,
        brand: s.p.brand,
        unit: s.p.unit,
        score: s.score,
      })),
    };
  });
}
