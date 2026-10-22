// Decides pass / fail / unknown for each eligibility clause, comparing the tender's
// requirement with the firm profile. The AI only extracted the clauses; every decision here
// is a plain comparison. Golden rule: a clause without a verified page + quote is never "pass".

const CORE_CLAUSES = ["emd", "turnover", "experience", "oem_authorization"];

const CLAUSE_LABELS = {
  emd: "EMD (bid security)",
  turnover: "Minimum turnover",
  experience: "Past experience",
  oem_authorization: "OEM authorization (MAF)",
  certificate: "Certificate",
  mse_exemption: "MSE exemption",
  approved_makes: "Approved makes",
};

function formatInr(n) {
  if (typeof n !== "number" || !isFinite(n)) return "?";
  if (n >= 1e7) return "₹" + +(n / 1e7).toFixed(2) + " crore";
  if (n >= 1e5) return "₹" + +(n / 1e5).toFixed(2) + " lakh";
  return "₹" + n.toLocaleString("en-IN");
}

function isNum(n) {
  return typeof n === "number" && isFinite(n);
}

function sameName(a, b) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

function stillValid(validUntil, today) {
  return validUntil == null || validUntil >= today;
}

function row(clause, result, firmHas, reason) {
  return {
    type: clause.type,
    label: CLAUSE_LABELS[clause.type] || clause.type,
    requirement: clause.requirement || null,
    firmHas: firmHas,
    result: result,
    reason: reason,
    page: clause.page == null ? null : clause.page,
    quote: clause.quote || null,
  };
}

// Reads the tender's MSE exemption clauses. Tenders often state the experience/turnover and
// EMD exemptions in separate lines, so each one comes from whichever verified clause says it.
function mseExemptions(clauses) {
  const verified = clauses.filter((x) => x.type === "mse_exemption" && x.verified);
  const grants = (key) => verified.find((c) => c.values && c.values[key] === true) || null;
  return { experienceAndTurnover: grants("experienceAndTurnover"), emd: grants("emd") };
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// "during the last seven years" sets a look-back window for past works, not a minimum
// experience. True when `years` is just that window.
function isLookbackYears(c, years) {
  const v = c.values || {};
  if (v.lookbackYears === years) return true;
  const m = String(c.quote || "").toLowerCase().match(/(?:during|in|within)\s+the\s+(?:last|preceding|past)\s+(\d+|[a-z]+)\s+(?:\(\w+\)\s+)?years?/);
  if (!m) return false;
  return (/^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]]) === years;
}

function checkTurnover(c, firm, exempt) {
  const v = c.values || {};
  const has = formatInr(firm.avgAnnualTurnoverInr) + " average";
  if (v.notRequired === true) return row(c, "pass", has, "Tender sets no turnover requirement");
  if (!isNum(v.minAvgAnnualInr)) return row(c, "unknown", has, "Turnover amount could not be read from the tender");
  if (firm.avgAnnualTurnoverInr >= v.minAvgAnnualInr) {
    return row(c, "pass", has, "Firm turnover meets " + formatInr(v.minAvgAnnualInr));
  }
  if (exempt && firm.isMSE) {
    return row(c, "pass", has, "Below " + formatInr(v.minAvgAnnualInr) + ", but the tender exempts MSEs (p. " + exempt.page + ")");
  }
  return row(c, "fail", has, "Needs " + formatInr(v.minAvgAnnualInr) + ", firm has " + formatInr(firm.avgAnnualTurnoverInr));
}

// Experience comes as years in business and/or "N orders of at least ₹X each" options;
// meeting any one option is enough.
function checkExperience(c, firm, exempt) {
  const v = c.values || {};
  const orders = firm.pastOrders || [];
  const has = firm.yearsOfExperience + " years, " + orders.length + " past orders";
  if (v.notRequired === true) return row(c, "pass", has, "Tender sets no experience requirement");
  const options = Array.isArray(v.orderOptions) ? v.orderOptions.filter((o) => isNum(o.count) && isNum(o.eachAtLeastInr)) : [];
  const years = isNum(v.years) && !isLookbackYears(c, v.years) ? v.years : null;
  if (years == null && options.length === 0) {
    return row(c, "unknown", has, "Experience requirement could not be read from the tender");
  }
  const problems = [];
  if (years != null && firm.yearsOfExperience < years) {
    problems.push("needs " + years + " years, firm has " + firm.yearsOfExperience);
  }
  if (options.length > 0) {
    const met = options.some((o) => orders.filter((x) => x.valueInr >= o.eachAtLeastInr).length >= o.count);
    if (!met) {
      problems.push("needs " + options.map((o) => o.count + " order(s) of " + formatInr(o.eachAtLeastInr)).join(" or "));
    }
  }
  if (problems.length === 0) return row(c, "pass", has, "Firm meets the experience requirement");
  if (exempt && firm.isMSE) {
    return row(c, "pass", has, "Short (" + problems.join("; ") + "), but the tender exempts MSEs (p. " + exempt.page + ")");
  }
  return row(c, "fail", has, problems.join("; "));
}

// EMD is money the firm deposits, so it isn't a fail; "pass" means the firm can comply,
// and the reason says what to arrange.
function checkEmd(c, firm, exempt) {
  const v = c.values || {};
  const has = firm.isMSE ? "Registered MSE" : "Not an MSE";
  if (v.required === false) return row(c, "pass", has, "No EMD required");
  if (exempt && firm.isMSE) return row(c, "pass", has, "EMD exempt for MSEs (p. " + exempt.page + ")");
  if (!isNum(v.amountInr)) return row(c, "unknown", has, "EMD amount could not be read from the tender");
  return row(c, "pass", has, "Arrange EMD of " + formatInr(v.amountInr));
}

function checkOem(c, firm, today) {
  const v = c.values || {};
  const mafs = firm.oemAuthorizations || [];
  const has = mafs.length ? mafs.map((m) => m.brand + (stillValid(m.validUntil, today) ? "" : " (expired)")).join(", ") : "None";
  if (v.required === false) return row(c, "pass", has, "No OEM authorization required");
  if (v.required !== true) return row(c, "unknown", has, "Could not tell whether OEM authorization is required");
  // Brands from values.brands, or else the AI's `makes` — kept only if the name really
  // appears in the clause's verified quote.
  const inQuote = (m) => sameName(m, m) && String(c.quote || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(String(m).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const listed = Array.isArray(v.brands) && v.brands.length ? v.brands : (Array.isArray(c.makes) ? c.makes : []).filter(inQuote);
  const brands = listed.filter(Boolean);
  if (brands.length === 0) {
    return row(c, "unknown", has, "OEM authorization required, but the tender doesn't say for which make; check manually");
  }
  const held = mafs.filter((m) => brands.some((b) => sameName(b, m.brand)));
  if (held.some((m) => stillValid(m.validUntil, today))) {
    const ok = held.find((m) => stillValid(m.validUntil, today));
    return row(c, "pass", has, "Firm holds a valid " + ok.brand + " authorization");
  }
  if (held.length) {
    return row(c, "fail", has, held[0].brand + " authorization expired on " + held[0].validUntil);
  }
  return row(c, "fail", has, "Needs authorization from " + brands.join(" / ") + "; firm holds " + has);
}

function checkCertificate(c, firm, today) {
  const v = c.values || {};
  const name = v.name || c.requirement;
  if (!name) return row(c, "unknown", "—", "Certificate name could not be read from the tender");
  const cert = (firm.certificates || []).find((x) => sameName(x.name, name));
  if (!cert) return row(c, "fail", "Not held", "Firm does not hold " + name);
  const has = cert.name + (cert.validUntil ? " (valid until " + cert.validUntil + ")" : "");
  if (!stillValid(cert.validUntil, today)) return row(c, "fail", has, cert.name + " expired on " + cert.validUntil);
  return row(c, "pass", has, "Firm holds a valid " + cert.name);
}

// Approved-makes lists name the brands allowed per item group. The firm must be able to
// supply at least one allowed brand in every group (from a MAF it holds).
function checkApprovedMakes(c, firm, today) {
  const v = c.values || {};
  const groups = Array.isArray(v.items) ? v.items.filter((g) => Array.isArray(g.brands) && g.brands.length) : [];
  const brands = (firm.oemAuthorizations || []).filter((m) => stillValid(m.validUntil, today)).map((m) => m.brand);
  const has = brands.join(", ") || "None";
  if (groups.length === 0) return row(c, "unknown", has, "Approved-makes list could not be read from the tender");
  const missing = groups.filter((g) => !g.brands.some((b) => brands.some((f) => sameName(b, f))));
  if (missing.length === 0) return row(c, "pass", has, "Firm can supply an approved make for every item group");
  return row(c, "fail", has, "No approved make held for: " + missing.map((g) => g.itemGroup + " (" + g.brands.join("/") + ")").join("; "));
}

function evaluateClause(c, firm, today, exemptions) {
  switch (c.type) {
    case "turnover": return checkTurnover(c, firm, exemptions.experienceAndTurnover);
    case "experience": return checkExperience(c, firm, exemptions.experienceAndTurnover);
    case "emd": return checkEmd(c, firm, exemptions.emd);
    case "oem_authorization": return checkOem(c, firm, today);
    case "certificate": return checkCertificate(c, firm, today);
    case "approved_makes": return checkApprovedMakes(c, firm, today);
    case "mse_exemption": {
      const v = c.values || {};
      const parts = [];
      if (v.experienceAndTurnover != null) parts.push("experience & turnover: " + (v.experienceAndTurnover ? "yes" : "no"));
      if (v.emd != null) parts.push("EMD: " + (v.emd ? "yes" : "no"));
      return row(c, "info", firm.isMSE ? "Registered MSE" : "Not an MSE", "MSE exemption in this tender: " + (parts.join(", ") || "not stated"));
    }
    default: return null;
  }
}

// clauses: AI-extracted clauses after verifyQuotes (each has `verified`, `verifyNote`).
// today: "YYYY-MM-DD". Returns one row per clause, plus an "unknown" row for each core
// clause type the tender seemed not to have.
function evaluateEligibility(clauses, firm, today) {
  const list = clauses || [];
  const exemptions = mseExemptions(list);
  const rows = [];
  for (const c of list) {
    if (!c.verified) {
      rows.push(row(c, "unknown", null, (c.verifyNote || "Quote could not be verified") + "; check the tender manually"));
      continue;
    }
    const r = evaluateClause(c, firm, today, exemptions);
    if (r) rows.push(r);
  }
  for (const type of CORE_CLAUSES) {
    if (!list.some((c) => c.type === type)) {
      rows.push(row({ type: type }, "unknown", null, "Not found in the tender; check manually"));
    }
  }
  const order = { fail: 0, unknown: 1, pass: 2, info: 3 };
  return rows.sort((a, b) => order[a.result] - order[b.result]);
}
