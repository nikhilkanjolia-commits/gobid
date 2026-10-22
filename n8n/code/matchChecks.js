// Double-checks each BOQ line and the SKU the AI matched to it, using plain rules.
// Red flag = very likely wrong; amber flag = the owner should look. Nothing is hidden:
// every BOQ line comes back, with its flags.

function num(x) {
  return typeof x === "number" && isFinite(x) ? x : null;
}

// Reads current (A), breaking capacity (kA), poles, cores and size (sq mm) from free text.
function parseSpecs(text) {
  const t = " " + String(text || "").toLowerCase() + " ";
  const pick = (re) => {
    const m = t.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  let poles = pick(/(\d)\s*(?:poles?|p)\b/);
  if (poles == null) {
    if (/\bsp\b/.test(t)) poles = 1;
    else if (/\bdp\b/.test(t)) poles = 2;
    else if (/\btp\b/.test(t)) poles = 3;
    else if (/\bfp\b/.test(t)) poles = 4;
  }
  return {
    amps: pick(/(\d+(?:\.\d+)?)\s*(?:amps?|a)\b/),
    ka: pick(/(\d+(?:\.\d+)?)\s*ka\b/),
    poles: poles,
    cores: pick(/(\d+(?:\.\d+)?)\s*(?:cores?|c)\b/),
    sqmm: pick(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*mm|sqmm|mm2|mm²)/),
  };
}

function normUnit(u) {
  const s = String(u || "").toLowerCase().replace(/[^a-z]/g, "");
  if (["no", "nos", "number", "numbers", "each", "ea", "pcs", "pc", "piece", "pieces"].includes(s)) return "nos";
  if (["m", "mtr", "mtrs", "meter", "meters", "metre", "metres", "rm", "rmt"].includes(s)) return "m";
  if (["set", "sets"].includes(s)) return "set";
  return s;
}

function sameBrand(a, b) {
  const n = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return !!n(a) && !!n(b) && (n(a).includes(n(b)) || n(b).includes(n(a)));
}

function specFlags(boqText, sku) {
  const want = parseSpecs(boqText);
  const got = parseSpecs(sku.description);
  if (num(sku.ratingKA) != null) got.ka = sku.ratingKA;
  if (num(sku.poles) != null) got.poles = sku.poles;
  const flags = [];
  const differs = (key, label, unit) => {
    if (want[key] != null && got[key] != null && want[key] !== got[key]) {
      flags.push({ level: "red", text: label + " mismatch: tender " + want[key] + unit + ", SKU " + got[key] + unit });
    }
  };
  differs("amps", "Current rating", " A");
  differs("poles", "Poles", "");
  differs("cores", "Cores", "");
  differs("sqmm", "Cable size", " sq mm");
  if (want.ka != null && got.ka != null) {
    if (got.ka < want.ka) {
      flags.push({ level: "red", text: "Breaking capacity too low: tender " + want.ka + " kA, SKU " + got.ka + " kA" });
    } else if (got.ka > want.ka) {
      flags.push({ level: "amber", text: "Higher breaking capacity than asked (" + got.ka + " vs " + want.ka + " kA); check price" });
    }
  }
  return flags;
}

// boqRows: AI-extracted BOQ lines after verifyQuotes. matches: [{ item, sku, confidence, reason }]
// from the AI. priceRows: validated price-list rows. approvedBrands: brands allowed by the
// tender (empty array if the tender has no approved-makes list).
function checkMatches(boqRows, matches, priceRows, approvedBrands) {
  const skuMap = new Map((priceRows || []).map((p) => [String(p.sku).trim().toLowerCase(), p]));
  const matchMap = new Map((matches || []).map((m) => [String(m.item), m]));
  const approved = (approvedBrands || []).filter(Boolean);

  return (boqRows || []).map((r) => {
    const qty = num(r.qty);
    const rate = num(r.rate);
    const amount = num(r.amount);
    const out = {
      item: r.item,
      description: r.description,
      unit: r.unit || null,
      qty: qty,
      page: r.page == null ? null : r.page,
      quote: r.quote || null,
      printedRate: rate,
      printedAmount: amount,
      status: "ok",
      sku: null,
      skuDescription: null,
      brand: null,
      listPrice: null,
      discountPct: null,
      confidence: null,
      matchReason: null,
      flags: [],
    };

    // Is the line itself trustworthy?
    if (!r.verified) {
      out.status = "unreliable";
      out.flags.push({ level: "red", text: (r.verifyNote || "Line not found in the PDF") + "; not priced" });
    }
    if (qty == null || qty <= 0 || !r.unit) {
      out.status = "unreliable";
      out.flags.push({ level: "red", text: "Quantity or unit could not be extracted reliably; not priced" });
    }
    if (qty != null && rate != null && amount != null && Math.abs(qty * rate - amount) > 1) {
      out.flags.push({ level: "red", text: "Printed amount " + amount + " ≠ qty × rate (" + +(qty * rate).toFixed(2) + ")" });
    }

    // Is the SKU match trustworthy?
    const m = matchMap.get(String(r.item));
    const sku = m && m.sku ? skuMap.get(String(m.sku).trim().toLowerCase()) : null;
    if (!sku) {
      if (out.status === "ok") out.status = "unmatched";
      out.flags.push({
        level: "amber",
        text: m && m.sku ? "AI suggested SKU " + m.sku + ", which isn't in the price lists; price manually" : "No matching SKU in the price lists; price manually",
      });
      return out;
    }
    out.sku = sku.sku;
    out.skuDescription = sku.description;
    out.brand = sku.brand;
    out.listPrice = sku.listPrice;
    out.discountPct = sku.discountPct;
    out.confidence = num(m.confidence);
    out.matchReason = m.reason || null;

    if (out.confidence == null || out.confidence < 0.7) {
      out.flags.push({ level: "amber", text: "Unsure match (confidence " + (out.confidence == null ? "?" : out.confidence.toFixed(2)) + "); review" });
    }
    out.flags.push(...specFlags(r.description, sku));
    if (approved.length && !approved.some((b) => sameBrand(b, sku.brand))) {
      out.flags.push({ level: "amber", text: sku.brand + " is not in the tender's approved makes (" + approved.join(", ") + ")" });
    }
    if (r.unit && sku.unit && normUnit(r.unit) !== normUnit(sku.unit)) {
      out.flags.push({ level: "amber", text: "Unit differs: tender " + r.unit + ", price list " + sku.unit });
    }
    return out;
  });
}
