// Bid Readiness: what documents, technical checks and actions remain before a bid is ready for
// a human to review. Every status here is decided by plain rules from verified evidence: the AI
// only read the tender and the supporting documents. Unknown is never treated as a pass.
// Uses verifyQuote (verifyQuotes.js) and parseSpecs (matchChecks.js); the n8n "Decide" node
// stacks those files before this one.

const DOC_LABELS = {
  oem_authorization: "OEM authorization (MAF)",
  turnover_evidence: "Turnover evidence",
  experience_evidence: "Similar-work experience proof",
  emd_or_bid_security: "EMD / bid security",
  gst_registration: "GST registration",
  pan_card: "PAN",
  udyam_registration: "Udyam (MSE) registration",
  bis_certificate: "BIS certificate",
  iso_certificate: "ISO certificate",
  type_test_report: "Type-test report",
  technical_datasheet: "Technical datasheet",
  local_content_declaration: "Local-content declaration",
  signed_annexure: "Signed annexure / undertaking",
  electrical_licence: "Electrical contractor licence",
  other: "Other document",
};

// Which firm-profile certificate can stand for a document type (only as "you say you hold it").
const PROFILE_CERT_HINTS = {
  gst_registration: /gst/i,
  udyam_registration: /udyam|msme/i,
  iso_certificate: /iso/i,
  bis_certificate: /\bbis\b/i,
  electrical_licence: /electric.*licen/i,
};

function rdNorm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const RD_COMPANY_WORDS = /\b(pvt|private|ltd|limited|india|co|company|llp|inc|m\/s|ms|electric(al)?s?)\b\.?/gi;

// Two names refer to the same firm or brand: "SCHNEIDER ELECTRIC INDIA PVT LTD" ~ "Schneider",
// and an abbreviation ~ the full name: "L&T" ~ "Larsen & Toubro Limited".
function rdSameName(a, b) {
  const strip = (s) => rdNorm(String(s || "").replace(RD_COMPANY_WORDS, ""));
  const x = strip(a);
  const y = strip(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const initials = (s) => (String(s || "").replace(RD_COMPANY_WORDS, "").match(/[A-Za-z][A-Za-z]+/g) || []).map((w) => w[0].toLowerCase()).join("");
  const isShort = (s) => s.length >= 2 && s.length <= 4;
  return (isShort(x) && initials(b) === x) || (isShort(y) && initials(a) === y);
}

// Lowercase words without a plural "s", for comparing product names ("MCCBs" ~ "MCCB").
function rdWords(s) {
  return (String(s || "").toLowerCase().match(/[a-z]{3,}/g) || []).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

// "31/03/2027", "31-Mar-2027", "March 31, 2027" in a quote all contain 2027, 31 and 3 or Mar.
function rdDateInQuote(iso, quote) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const q = String(quote || "").toLowerCase();
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const day = String(Number(m[3]));
  const mon = Number(m[2]);
  const hasYear = q.includes(m[1]) || q.includes("'" + m[1].slice(2)) || new RegExp("[/.-]" + m[1].slice(2) + "\\b").test(q);
  const hasDay = new RegExp("(^|\\D)0?" + day + "(\\D|$)").test(q);
  const hasMonth = q.includes(months[mon - 1]) || new RegExp("(^|\\D)0?" + mon + "(\\D|$)").test(q);
  return hasYear && hasDay && hasMonth;
}

// A field from a supporting document counts only if its quote is really on the cited page of
// that document AND the quote actually contains the value.
function rdFieldVerified(doc, field, value) {
  if (value == null || (Array.isArray(value) && value.length === 0)) return false;
  const evidence = (doc.evidence || []).filter((e) => e.field === field);
  return evidence.some((e) => {
    if (!verifyQuote(doc.pages, e.page, e.quote).verified) return false;
    if (field === "issueDate" || field === "validUntil") return rdDateInQuote(value, e.quote);
    const values = Array.isArray(value) ? value : [value];
    return values.some((v) => {
      const words = String(v).toLowerCase().match(/[a-z0-9]+/g) || [];
      const q = String(e.quote).toLowerCase();
      return words.length > 0 && words.every((w) => q.includes(w));
    });
  });
}

// Joins the uploaded files with what the AI read from them. files: [{name, pages, unreadable,
// error}]; aiDocs: toSupportingDocs(...) output. Unverified fields are set to null.
function checkSupportingDocs(files, aiDocs) {
  return (files || []).map((f, i) => {
    const base = { index: i + 1, fileName: f.name, readable: !f.unreadable, problem: f.error || null, docType: null, title: null, fields: {}, unverifiedFields: [] };
    if (f.unreadable) return Object.assign(base, { problem: f.error || "No readable text (scanned?). Not analysed." });
    const ai = (aiDocs || []).find((d) => d.docIndex === i + 1);
    if (!ai) return Object.assign(base, { problem: "The AI couldn't identify this document." });
    const withPages = Object.assign({}, ai, { pages: f.pages });
    const fields = {};
    const unverified = [];
    for (const k of SUPPORT_FIELD_NAMES) {
      const v = ai[k];
      if (v == null || (Array.isArray(v) && !v.length)) continue;
      if (rdFieldVerified(withPages, k, v)) fields[k] = v;
      else unverified.push(k);
    }
    return Object.assign(base, { docType: ai.docType, title: ai.title, fields: fields, unverifiedFields: unverified });
  });
}
const SUPPORT_FIELD_NAMES = ["issuer", "holder", "manufacturer", "productCategories", "tenderReference", "territory", "issueDate", "validUntil", "signatory", "certificateNumber", "standard"];

// The tender's own reference, read by code from the page text (GeM bid number or NIT number).
function tenderReference(pages) {
  for (const p of pages || []) {
    const gem = String(p.text).match(/GEM\/\d{4}\/[BR]\/\d+/);
    if (gem) return gem[0];
  }
  for (const p of pages || []) {
    const nit = String(p.text).match(/NIT\s*No\.?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-.]{3,40})/i);
    if (nit) return nit[1].replace(/[.,]$/, "");
  }
  return null;
}

// OEM authorization: compares the tender's requirement with the uploaded letter(s) field by field.
// Returns { status: not_required | missing | verified | needs_review | conflict, fields, ... }.
function checkOemAuthorization(opts) {
  const { clauses, docRequirements, supportingDocs, firm, today, tenderRef, boqDescriptions } = opts;
  const clause = (clauses || []).find((c) => c.type === "oem_authorization");
  const docReq = (docRequirements || []).find((d) => d.docType === "oem_authorization");
  const source = clause && clause.verified ? clause : docReq && docReq.verified ? docReq : clause || docReq || null;
  const requiredByTender =
    (clause && clause.verified && clause.values && clause.values.required === true) ||
    (docReq && docReq.verified && docReq.requirement === "required");
  const conditional = !requiredByTender && docReq && docReq.verified && docReq.requirement === "conditional";
  const unverifiedMention = !requiredByTender && !conditional && ((clause && !clause.verified) || (docReq && !docReq.verified));
  const tenderMakes = (clause && clause.verified ? (clause.values && clause.values.brands && clause.values.brands.length ? clause.values.brands : clause.makes) : []) || [];
  const letters = (supportingDocs || []).filter((d) => d.docType === "oem_authorization");
  const base = {
    requirement: requiredByTender ? "required" : conditional ? "conditional" : unverifiedMention ? "not established" : "not required",
    condition: conditional ? docReq.condition : null,
    tenderMakes: tenderMakes,
    page: source ? source.page : null,
    quote: source ? source.quote : null,
    letterFile: null,
    fields: [],
  };

  if (!requiredByTender && !conditional && !unverifiedMention && letters.length === 0) {
    return Object.assign(base, { status: "not_required", reason: "The tender doesn't ask for an OEM authorization (none found with a verified quote)." });
  }
  if (letters.length === 0) {
    if (unverifiedMention) {
      return Object.assign(base, { status: "needs_review", reason: "The tender seems to mention OEM authorization, but the quote couldn't be verified. Check the tender." });
    }
    return Object.assign(base, {
      status: requiredByTender ? "missing" : "needs_review",
      reason: requiredByTender
        ? "The tender requires an OEM authorization and none was uploaded."
        : "The tender asks for an OEM authorization only " + (docReq.condition || "in some cases") + ". Check whether it applies to you.",
    });
  }

  // Pick the letter that best matches the tender's makes.
  const letter = letters.find((l) => tenderMakes.some((m) => rdSameName(m, l.fields.manufacturer))) || letters[0];
  const f = letter.fields;
  const row = (field, tender, letterValue, result, note) => ({ field: field, tender: tender, letter: letterValue, result: result, note: note || null });
  const fields = [];

  // Manufacturer
  if (!f.manufacturer) fields.push(row("Manufacturer / OEM", tenderMakes.join(" / ") || "Not specified", null, "missing", "Not stated (or not verifiable) in the letter"));
  else if (!tenderMakes.length) fields.push(row("Manufacturer / OEM", "Not specified", f.manufacturer, "match", "Tender names no specific make"));
  else if (tenderMakes.some((m) => rdSameName(m, f.manufacturer))) fields.push(row("Manufacturer / OEM", tenderMakes.join(" / "), f.manufacturer, "match"));
  else fields.push(row("Manufacturer / OEM", tenderMakes.join(" / "), f.manufacturer, "conflict", "Letter is from a make the tender doesn't ask for"));

  // Authorized party
  if (!f.holder) fields.push(row("Authorized bidder", firm.name, null, "missing", "Letter doesn't name who is authorized"));
  else if (rdSameName(f.holder, firm.name)) fields.push(row("Authorized bidder", firm.name, f.holder, "match"));
  else fields.push(row("Authorized bidder", firm.name, f.holder, "conflict", "Letter authorizes someone else"));

  // Product scope
  const cats = f.productCategories || [];
  if (!cats.length) fields.push(row("Product family", "Tendered items", null, "missing", "Letter doesn't state which products it covers"));
  else {
    const words = cats.flatMap(rdWords);
    const covers = (boqDescriptions || []).some((d) => {
      const have = rdWords(d);
      return words.some((w) => have.includes(w));
    });
    fields.push(row("Product family", "Tendered items", cats.join(", "), covers ? "match" : "review", covers ? null : "Couldn't confirm the letter covers the tendered items"));
  }

  // Tender reference
  const bidSpecific = /specific to (this|the) (bid|tender)|bid specific|tender specific|for this (bid|tender)/i.test(String(base.quote || ""));
  if (!f.tenderReference) fields.push(row("Tender reference", tenderRef || "—", null, bidSpecific ? "missing" : "info", bidSpecific ? "Tender asks for a bid-specific letter" : "Not stated"));
  else if (tenderRef && rdNorm(f.tenderReference).includes(rdNorm(tenderRef))) fields.push(row("Tender reference", tenderRef, f.tenderReference, "match"));
  else if (tenderRef) fields.push(row("Tender reference", tenderRef, f.tenderReference, "conflict", "Letter is for a different bid"));
  else fields.push(row("Tender reference", "—", f.tenderReference, "review", "Couldn't read this tender's reference to compare"));

  // Territory, dates, signatory
  fields.push(row("Territory", "—", f.territory || null, f.territory ? "info" : "info", f.territory ? null : "Not stated"));
  if (!f.issueDate) fields.push(row("Issue date", "—", null, "missing", "No verifiable issue date"));
  else if (f.issueDate > today) fields.push(row("Issue date", "—", f.issueDate, "review", "Dated in the future: check the date"));
  else fields.push(row("Issue date", "—", f.issueDate, "info"));
  if (!f.validUntil) fields.push(row("Valid until", "On the bid date", null, "missing", "No verifiable validity date"));
  else if (f.validUntil < today) fields.push(row("Valid until", "On the bid date", f.validUntil, "conflict", "Expired"));
  else fields.push(row("Valid until", "On the bid date", f.validUntil, "match"));
  fields.push(row("Authorized signatory", "—", f.signatory || null, f.signatory ? "match" : "missing", f.signatory ? null : "Signatory not stated"));

  const conflict = fields.find((x) => x.result === "conflict");
  const keyMissing = fields.find((x) => (x.result === "missing" || x.result === "review") && x.field !== "Territory");
  let status;
  let reason;
  if (conflict) {
    status = "conflict";
    reason = conflict.field + ": " + (conflict.note || "doesn't match the tender") + (conflict.letter ? " (" + conflict.letter + ")" : "");
  } else if (keyMissing || letter.unverifiedFields.length) {
    status = "needs_review";
    reason = keyMissing ? keyMissing.field + ": " + (keyMissing.note || "can't be verified") : "Some fields in the letter couldn't be matched to its text";
  } else {
    status = "verified";
    reason = "Letter matches the tender on manufacturer, bidder, products, reference and validity.";
  }
  return Object.assign(base, { status: status, reason: reason, letterFile: letter.fileName, fields: fields, unverifiedFields: letter.unverifiedFields });
}

function rdAction(status, label, extra) {
  if (status === "Missing") return "Get and upload the " + label + extra;
  if (status === "Expired") return "Renew the " + label + " before the bid closes" + extra;
  if (status === "Needs review") return "Check the " + label + extra;
  return null;
}

// The document checklist: one row per document the tender asks for.
function evaluateDocuments(opts) {
  const { docRequirements, supportingDocs, firm, today, oem } = opts;
  return (docRequirements || []).map((req) => {
    const label = req.name || DOC_LABELS[req.docType] || "Document";
    const out = {
      docType: req.docType,
      name: label,
      requirement: !req.verified ? "not established" : req.requirement,
      condition: req.condition || null,
      page: req.page,
      quote: req.quote,
      status: "Needs review",
      reason: "",
      action: null,
      evidence: null,
    };
    const set = (status, reason, action) => Object.assign(out, { status: status, reason: reason, action: action === undefined ? rdAction(status, label, "") : action });

    if (!req.verified) return set("Needs review", (req.verifyNote || "Requirement quote not found in the tender") + ". Check the tender.", "Find this requirement in the tender and confirm it");

    if (req.docType === "oem_authorization" && oem) {
      out.evidence = oem.letterFile;
      if (oem.status === "verified") return set("Verified", oem.reason, null);
      if (oem.status === "conflict") return set("Missing", "Uploaded letter doesn't satisfy the tender: " + oem.reason, "Get a correct MAF from " + (oem.tenderMakes.join(" / ") || "the OEM") + " naming your firm and this bid");
      if (oem.status === "missing") return set(req.requirement === "conditional" ? "Needs review" : "Missing", oem.reason, "Request a MAF from " + (oem.tenderMakes.join(" / ") || "the OEM") + " for this bid and upload it");
      return set("Needs review", oem.reason);
    }

    // Same kind of document; when the requirement names a standard number (ISO 14001, IS 694),
    // the document must state that number too.
    const sameKind = (supportingDocs || []).filter((d) => d.readable && d.docType === req.docType);
    const reqNumber = (String(req.name).match(/\b\d{3,5}\b/) || [])[0];
    const doc = reqNumber
      ? sameKind.find((d) => String((d.fields.standard || "") + " " + (d.title || "")).includes(reqNumber))
      : sameKind[0];
    const unreadable = (supportingDocs || []).find((d) => !d.readable);

    if (doc) {
      out.evidence = doc.fileName;
      const f = doc.fields;
      if (f.validUntil && f.validUntil < today) return set("Expired", doc.fileName + " expired on " + f.validUntil + ".");
      if (f.holder && firm.name && !rdSameName(f.holder, firm.name)) return set("Needs review", doc.fileName + " is issued to \"" + f.holder + "\", not " + firm.name + ".", "Check the document is in your firm's name");
      const keyFields = ["holder", "certificateNumber", "standard", "issuer"].filter((k) => f[k]);
      if (!keyFields.length) return set("Needs review", doc.fileName + " was found, but its holder, number or issuer couldn't be verified from its text.", "Open " + doc.fileName + " and confirm it is the right document");
      if (req.requirement === "conditional") return set("Needs review", "Document uploaded; the tender asks for it only " + (req.condition || "in some cases") + ".", "Confirm whether the condition applies");
      return set("Verified", doc.fileName + ": " + keyFields.map((k) => k + " " + (Array.isArray(f[k]) ? f[k].join(", ") : f[k])).join("; ") + (f.validUntil ? "; valid until " + f.validUntil : "") + ".", null);
    }

    // Nothing uploaded: the firm profile can only say you hold it, not prove it.
    const hint = PROFILE_CERT_HINTS[req.docType];
    const profileCert = hint ? (firm.certificates || []).find((c) => hint.test(c.name) && (req.docType !== "iso_certificate" || rdNorm(req.name).includes(rdNorm(c.name).slice(0, 7)))) : null;
    if (profileCert && profileCert.validUntil && profileCert.validUntil < today) {
      return set("Expired", "Firm profile: " + profileCert.name + " expired on " + profileCert.validUntil + ".");
    }
    if (req.requirement === "conditional") {
      return set("Needs review", "Required only " + (req.condition || "in some cases") + ". Nothing uploaded.", "Check whether this applies to you; if so, upload it");
    }
    if (profileCert) {
      return set("Needs review", "Firm profile says you hold " + profileCert.name + (profileCert.validUntil ? " (valid until " + profileCert.validUntil + ")" : "") + ", but no copy was uploaded to check.", "Upload a copy of " + profileCert.name);
    }
    return set("Missing", "No uploaded document matches." + (unreadable ? " (" + unreadable.fileName + " couldn't be read.)" : ""));
  });
}

// Technical compliance matrix: one row per BOQ line, one cell per parameter the tender states.
const CRITICAL_PARAMS = { amps: "Rated current", poles: "Poles", ka: "Breaking capacity", cores: "Cores", sqmm: "Conductor size", kv: "Voltage grade" };
const PARAM_UNITS = { amps: " A", poles: "P", ka: " kA", cores: "C", sqmm: " sq mm", kv: " kV" };

function technicalCompliance(checkedRows, priceRows) {
  const bySku = new Map((priceRows || []).map((p) => [String(p.sku).toLowerCase(), p]));
  return (checkedRows || []).map((r) => {
    const want = parseSpecs(r.description);
    const sku = r.sku ? bySku.get(String(r.sku).toLowerCase()) : null;
    const got = sku ? parseSpecs(sku.description) : {};
    if (sku && typeof sku.ratingKA === "number") got.ka = sku.ratingKA;
    if (sku && typeof sku.poles === "number") got.poles = sku.poles;
    const params = [];
    for (const key of Object.keys(CRITICAL_PARAMS)) {
      if (want[key] == null) continue;
      const required = want[key] + PARAM_UNITS[key];
      const productValue = got[key] == null ? null : got[key] + PARAM_UNITS[key];
      let result;
      let note = null;
      if (!sku) {
        result = "unknown";
        note = "No matched product";
      } else if (got[key] == null) {
        result = "unknown";
        note = "Not in the catalogue entry: check the datasheet";
      } else if (key === "ka" && got.ka > want.ka) {
        result = "match";
        note = "Higher than required";
      } else if (got[key] === want[key]) result = "match";
      else {
        result = "mismatch";
        note = key === "ka" && got.ka < want.ka ? "Below the required breaking capacity" : "Doesn't match the tender";
      }
      params.push({ parameter: CRITICAL_PARAMS[key], required: required, product: productValue, result: result, note: note });
    }
    const brandFlag = (r.flags || []).find((f) => /approved make/.test(f.text));
    if (sku) {
      params.unshift({ parameter: "Make", required: brandFlag ? brandFlag.text.replace(/^.*\(([^)]*)\)$/, "$1") : "Any / not restricted", product: sku.brand, result: brandFlag ? "mismatch" : "match", note: brandFlag ? "Not an approved make for this item" : null });
    }

    const lowConfidence = r.confidence != null && r.confidence < 0.7;
    let status;
    let reason;
    if (params.some((p) => p.result === "mismatch" && p.parameter !== "Make")) {
      status = "Not compliant";
      reason = params.filter((p) => p.result === "mismatch").map((p) => p.parameter + ": needs " + p.required + ", product has " + p.product).join("; ");
    } else if (!sku) {
      status = "Needs review";
      reason = "No product matched in the price lists";
    } else if (brandFlag) {
      status = "Needs review";
      reason = brandFlag.text;
    } else if (params.filter((p) => p.parameter !== "Make").length === 0) {
      status = "Needs review";
      reason = "The tender line states no parameters code can compare; check the specification";
    } else if (params.some((p) => p.result === "unknown")) {
      status = "Needs review";
      reason = params.filter((p) => p.result === "unknown").map((p) => p.parameter + " not in catalogue").join("; ");
    } else if (lowConfidence) {
      status = "Needs review";
      reason = "AI was unsure this is the same product (confidence " + r.confidence.toFixed(2) + ")";
    } else {
      status = "Compliant";
      reason = "All stated parameters match the catalogue entry";
    }
    return {
      item: r.item,
      description: r.description,
      page: r.page,
      sku: sku ? sku.sku : null,
      skuDescription: sku ? sku.description : null,
      source: sku ? sku.source || "price list" : null,
      confidence: r.confidence == null ? null : r.confidence,
      status: status,
      reason: reason,
      params: params,
    };
  });
}

// The overall Bid Readiness status, counts and a prioritized action list. Status rules:
//   any eligibility fail, required document Missing/Expired, OEM conflict/missing (required),
//   or Not-compliant BOQ line                                      → Potential disqualification
//   else anything unknown / Needs review / unmatched               → Review required
//   else                                                           → Ready for human review
function computeReadiness(opts) {
  const { eligibility, documents, oem, compliance, boqTotals } = opts;
  const actions = [];
  let passed = 0;
  let failed = 0;
  let review = 0;
  const add = (priority, area, text, page, quote) => actions.push({ priority: priority, area: area, text: text, page: page == null ? null : page, quote: quote || null });

  for (const e of eligibility || []) {
    // The eligibility rule only knows the firm profile's MAFs. An uploaded, checked letter for
    // this bid settles that clause; a letter still being checked turns a fail into a review.
    if (e.type === "oem_authorization" && e.result === "fail" && oem && (oem.status === "verified" || oem.status === "needs_review")) {
      if (oem.status === "verified") passed++;
      else {
        review++;
        add(2, "Eligibility", e.label + ": firm profile has no matching MAF, but an uploaded letter (" + oem.letterFile + ") may cover it. " + oem.reason, e.page, e.quote);
      }
      continue;
    }
    if (e.result === "pass") passed++;
    else if (e.result === "fail") {
      failed++;
      add(1, "Eligibility", e.label + ": " + e.reason, e.page, e.quote);
    } else if (e.result === "unknown") {
      review++;
      add(2, "Eligibility", e.label + ": " + e.reason, e.page, e.quote);
    }
  }
  for (const d of documents || []) {
    if (d.status === "Verified") passed++;
    else if (d.status === "Not applicable") continue;
    else if ((d.status === "Missing" || d.status === "Expired") && d.requirement === "required") {
      failed++;
      add(1, "Documents", d.name + ": " + (d.action || d.reason), d.page, d.quote);
    } else {
      review++;
      add(2, "Documents", d.name + ": " + (d.action || d.reason), d.page, d.quote);
    }
  }
  // The OEM check counts on its own only when the document list doesn't already include it.
  if (oem && oem.status !== "not_required" && !(documents || []).some((d) => d.docType === "oem_authorization")) {
    if (oem.status === "verified") passed++;
    else if (oem.status === "conflict" || (oem.status === "missing" && oem.requirement === "required")) {
      failed++;
      add(1, "OEM authorization", oem.reason, oem.page, oem.quote);
    } else {
      review++;
      add(2, "OEM authorization", oem.reason, oem.page, oem.quote);
    }
  }
  for (const c of compliance || []) {
    if (c.status === "Compliant") passed++;
    else if (c.status === "Not compliant") {
      failed++;
      add(1, "Technical", "Item " + c.item + ": " + c.reason, c.page, null);
    } else {
      review++;
      add(3, "Technical", "Item " + c.item + ": " + c.reason, c.page, null);
    }
  }

  const status = failed > 0 ? "Potential disqualification" : review > 0 ? "Review required" : "Ready for human review";
  actions.sort((a, b) => a.priority - b.priority);
  return {
    status: status,
    counts: { passed: passed, failed: failed, review: review },
    criticalDocuments: (documents || []).filter((d) => (d.status === "Missing" || d.status === "Expired") && d.requirement === "required").map((d) => d.name),
    technicalMismatches: (compliance || []).filter((c) => c.status === "Not compliant").map((c) => "Item " + c.item + ": " + c.reason),
    unverifiedClauses: (eligibility || []).filter((e) => e.result === "unknown").map((e) => e.label + ": " + e.reason),
    actions: actions,
    boqTotal: boqTotals && boqTotals.bidTotal ? boqTotals.bidTotal : null,
    marginPct: boqTotals ? boqTotals.marginPct : null,
  };
}
