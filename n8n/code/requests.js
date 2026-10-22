// Builds the 4 Gemini requests and reads their answers. The AI only reads the tender;
// every decision is made afterwards by plain code. Each prompt asks for exact quotes so
// verifyQuotes can prove them, and says to leave a value null rather than guess.

const GEMINI_MODEL = "gemini-3-flash-preview";
const CLASSIFY_CHARS_PER_PAGE = 1500;
const MAX_PAGES_PER_CALL = 40;

const RULES_FOR_AI =
  "Rules: answer only from the pages given. Copy every quote EXACTLY as printed (same words, same order, " +
  "max 40 words) from the page you cite. If something isn't stated, leave it null; never guess or infer.";

function pagesBlock(pages, maxChars) {
  return pages
    .map((p) => "=== PAGE " + p.page + " ===\n" + (maxChars ? p.text.slice(0, maxChars) : p.text))
    .join("\n\n");
}

function geminiRequest(prompt, input, schema) {
  return {
    model: GEMINI_MODEL,
    body: {
      contents: [{ role: "user", parts: [{ text: prompt + "\n\n" + input }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingLevel: "low" },
      },
    },
  };
}

const S = {
  str: { type: "STRING" },
  strOrNull: { type: "STRING", nullable: true },
  numOrNull: { type: "NUMBER", nullable: true },
  intOrNull: { type: "INTEGER", nullable: true },
  boolOrNull: { type: "BOOLEAN", nullable: true },
};

// A1: label every page, using only the start of each page to stay fast.
function classifyRequest(pages) {
  const prompt =
    "You are reading an Indian government tender (GeM / CPPP / state portal) for electrical or solar work. " +
    "Label each page: 'eligibility' if it states bidder qualification or bid conditions (EMD, turnover, past " +
    "experience, OEM/manufacturer authorization, certificates, MSE exemption, approved makes/brands); 'boq' if it " +
    "contains Bill of Quantities / schedule of items with quantities; otherwise 'other'. A page can have more " +
    "than one label. Return every page number given.";
  const schema = {
    type: "OBJECT",
    properties: {
      pages: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            page: { type: "INTEGER" },
            labels: { type: "ARRAY", items: { type: "STRING", enum: ["eligibility", "boq", "other"] } },
          },
          required: ["page", "labels"],
        },
      },
    },
    required: ["pages"],
  };
  return geminiRequest(prompt, pagesBlock(pages, CLASSIFY_CHARS_PER_PAGE), schema);
}

// Pages the AI labelled, plus pages whose text contains a keyword (a safety net in case
// the classifier missed one), in page order, capped so the call stays fast.
function pickPages(pages, classified, label, keywords) {
  const labelled = new Set(
    ((classified && classified.pages) || []).filter((p) => (p.labels || []).includes(label)).map((p) => p.page),
  );
  const picked = pages.filter((p) => labelled.has(p.page) || keywords.test(p.text));
  return picked.slice(0, MAX_PAGES_PER_CALL);
}

const ELIGIBILITY_KEYWORDS = /turnover|e\.?m\.?d|earnest money|bid security|experience|authori[sz]ation|\bmaf\b|iso\s?\d|certificat|\bmse\b|approved make|list of makes/i;
const BOQ_KEYWORDS = /bill of quantit|\bboq\b|schedule of (items|quantit|requirement)|price schedule/i;

// Every field in the AI's answer is REQUIRED (null when it doesn't apply). Gemini quietly
// drops optional fields on long inputs, which lost quantities, EMD amounts and order values.
// So each clause is one flat object with every field present; toClauses() reshapes it.
const CLAUSE_FIELDS = {
  type: { type: "STRING", enum: ["emd", "turnover", "experience", "oem_authorization", "certificate", "mse_exemption", "approved_makes"] },
  requirement: S.str,
  page: S.intOrNull,
  quote: S.strOrNull,
  makes: { type: "ARRAY", items: S.str },
  emdRequired: S.boolOrNull,
  emdAmountInr: S.numOrNull,
  minAvgAnnualTurnoverInr: S.numOrNull,
  notRequired: S.boolOrNull,
  experienceYears: S.numOrNull,
  lookbackYears: S.numOrNull,
  orderOptions: {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: { count: { type: "INTEGER" }, eachAtLeastInr: { type: "NUMBER" } },
      required: ["count", "eachAtLeastInr"],
    },
  },
  oemRequired: S.boolOrNull,
  certificateName: S.strOrNull,
  mseExemptExperienceTurnover: S.boolOrNull,
  mseExemptEmd: S.boolOrNull,
  itemGroups: {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: { itemGroup: S.str, brands: { type: "ARRAY", items: S.str } },
      required: ["itemGroup", "brands"],
    },
  },
};

// Kinds of documents a tender can ask the bidder to submit (Bid Readiness checklist).
const DOC_TYPES = [
  "oem_authorization", "turnover_evidence", "experience_evidence", "emd_or_bid_security", "gst_registration",
  "pan_card", "udyam_registration", "bis_certificate", "iso_certificate", "type_test_report", "technical_datasheet",
  "local_content_declaration", "signed_annexure", "electrical_licence", "other",
];

const DOCUMENT_FIELDS = {
  docType: { type: "STRING", enum: DOC_TYPES },
  name: S.str,
  requirement: { type: "STRING", enum: ["required", "conditional"] },
  condition: S.strOrNull,
  page: S.intOrNull,
  quote: S.strOrNull,
};

// A2: find the eligibility clauses with normalized values, page and exact quote, and the
// documents the bidder must submit.
function eligibilityRequest(pages, classified) {
  const prompt =
    "Extract the bidder eligibility clauses from these tender pages. Clause types and the fields to fill:\n" +
    "- emd: earnest money / bid security. emdRequired (false only if the tender says no EMD), emdAmountInr.\n" +
    "- turnover: minimum average annual turnover. minAvgAnnualTurnoverInr in rupees (1 lakh = 100000, 1 crore = 10000000). notRequired=true only if the tender explicitly says none.\n" +
    "- experience: experienceYears = minimum years the bidder must have been doing similar work. orderOptions = every " +
    "'N similar works/orders each of at least ₹X' option, e.g. [{count:3, eachAtLeastInr:2000000}, {count:1, eachAtLeastInr:4000000}]. " +
    "lookbackYears = the period in which those works must have been completed ('during the last 7 years' → 7). " +
    "A look-back period is NOT experienceYears: leave experienceYears null unless the tender asks for N years of experience.\n" +
    "- oem_authorization: manufacturer/OEM authorization (MAF). oemRequired.\n" +
    "- certificate: one clause per required certificate/licence (ISO, BIS, electrical licence…). certificateName.\n" +
    "- mse_exemption: whether MSEs are exempted. mseExemptExperienceTurnover and mseExemptEmd as true/false, null if not stated.\n" +
    "- approved_makes: itemGroups = one object per item group: itemGroup = the item name only (e.g. \"MCCB\"), brands = each brand as a separate string.\n" +
    "Every field must be present: use null (or [] for lists) when it doesn't apply to the clause type. Return exactly " +
    "one clause each for emd, turnover, experience and oem_authorization (if present); certificate, mse_exemption and " +
    "approved_makes may repeat. makes = every manufacturer/brand name in the quote ([] if none).\n" +
    "Also list in documents[] every document the tender explicitly asks the bidder to submit or upload (MAF/OEM " +
    "authorization, turnover or CA certificate, experience proof such as purchase orders or completion certificates, " +
    "EMD or bid security declaration, GST, PAN, Udyam, BIS or ISO certificates, type-test reports, datasheets, local " +
    "content declaration, signed annexures/undertakings/forms, electrical licence…). requirement = 'conditional' when " +
    "the tender says it applies only in some cases (condition = that case, e.g. 'if the bidder is not the OEM'); " +
    "otherwise 'required'. Only list documents the tender actually asks for; never assume a standard list. " +
    RULES_FOR_AI;
  const schema = {
    type: "OBJECT",
    properties: {
      clauses: { type: "ARRAY", items: { type: "OBJECT", properties: CLAUSE_FIELDS, required: Object.keys(CLAUSE_FIELDS) } },
      documents: { type: "ARRAY", items: { type: "OBJECT", properties: DOCUMENT_FIELDS, required: Object.keys(DOCUMENT_FIELDS) } },
    },
    required: ["clauses", "documents"],
  };
  return geminiRequest(prompt, pagesBlock(pickPages(pages, classified, "eligibility", ELIGIBILITY_KEYWORDS)), schema);
}

// Reshapes A2's flat answer into the { type, requirement, values, makes, page, quote } clauses
// the rules read. Clauses already in that shape (e.g. the demo's) pass through unchanged.
function toClauses(answer) {
  return ((answer && answer.clauses) || []).map((c) => {
    if (c.values) return c;
    const values = {
      required: c.type === "emd" ? c.emdRequired : c.type === "oem_authorization" ? c.oemRequired : null,
      amountInr: c.emdAmountInr,
      minAvgAnnualInr: c.minAvgAnnualTurnoverInr,
      notRequired: c.notRequired,
      years: c.experienceYears,
      lookbackYears: c.lookbackYears,
      orderOptions: c.orderOptions,
      name: c.certificateName,
      experienceAndTurnover: c.mseExemptExperienceTurnover,
      emd: c.mseExemptEmd,
      items: c.itemGroups,
    };
    return { type: c.type, requirement: c.requirement, values: values, makes: c.makes || [], page: c.page, quote: c.quote };
  });
}

// A3: pull out the BOQ lines.
function boqRequest(pages, classified) {
  const prompt =
    "Extract every line item of the Bill of Quantities (BOQ / schedule of items) from these tender pages. " +
    "For each line: item number as printed, full description (join wrapped lines), unit, quantity (qty), and the " +
    "rate and amount if printed (null if not). Every field must be present. page = where the line starts; quote = " +
    "the exact printed text of the line's first few words of description (max 15 words). Skip headings and totals. " +
    RULES_FOR_AI;
  const schema = {
    type: "OBJECT",
    properties: {
      rows: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            item: S.str,
            description: S.str,
            unit: S.strOrNull,
            qty: S.numOrNull,
            rate: S.numOrNull,
            amount: S.numOrNull,
            page: S.intOrNull,
            quote: S.strOrNull,
          },
          required: ["item", "description", "unit", "qty", "rate", "amount", "page", "quote"],
        },
      },
    },
    required: ["rows"],
  };
  return geminiRequest(prompt, pagesBlock(pickPages(pages, classified, "boq", BOQ_KEYWORDS)), schema);
}

// A4: choose a SKU for each BOQ line, only from that line's shortlist.
function matchRequest(boqRows, shortlist) {
  const byItem = new Map(shortlist.map((s) => [String(s.item), s.candidates]));
  const lines = boqRows
    .filter((r) => (byItem.get(String(r.item)) || []).length > 0)
    .map((r) => ({
      item: r.item,
      description: r.description,
      unit: r.unit,
      candidates: byItem.get(String(r.item)).map((c) => ({ sku: c.sku, description: c.description, brand: c.brand, unit: c.unit })),
    }));
  const prompt =
    "Match each tender BOQ line to the supplier SKU that is the same product. Choose ONLY from that line's " +
    "candidates. Ratings must match exactly (amps, poles, kA, cores, sq mm, watts). If no candidate is the same " +
    "product, return sku null. confidence: 0 to 1, how sure you are it's the same product. reason: one short line.";
  const schema = {
    type: "OBJECT",
    properties: {
      matches: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { item: S.str, sku: S.strOrNull, confidence: { type: "NUMBER" }, reason: S.str },
          required: ["item", "sku", "confidence", "reason"],
        },
      },
    },
    required: ["matches"],
  };
  return { lineCount: lines.length, request: geminiRequest(prompt, JSON.stringify(lines), schema) };
}

// Document requirements from A2, checked into a fixed shape: unknown types become "other",
// anything without a name is dropped. (The AI's output is never trusted as-is.)
function toDocRequirements(answer) {
  return ((answer && answer.documents) || [])
    .filter((d) => d && typeof d.name === "string" && d.name.trim())
    .map((d) => ({
      docType: DOC_TYPES.includes(d.docType) ? d.docType : "other",
      name: d.name.trim().slice(0, 120),
      requirement: d.requirement === "conditional" ? "conditional" : "required",
      condition: typeof d.condition === "string" && d.condition.trim() ? d.condition.trim().slice(0, 200) : null,
      page: Number.isInteger(d.page) ? d.page : null,
      quote: typeof d.quote === "string" && d.quote.trim() ? d.quote : null,
    }));
}

// Fields read from a supporting document (MAF letter, certificate, purchase order…).
const SUPPORT_FIELDS = ["issuer", "holder", "manufacturer", "productCategories", "tenderReference", "territory", "issueDate", "validUntil", "signatory", "certificateNumber", "standard"];

// A6: read the bidder's supporting documents (only those with readable text). docs:
// [{ name, pages: [{page, text}] }]. Each field needs an exact quote so code can check it.
function supportingDocsRequest(docs) {
  const input = docs
    .map((d, i) => `##### DOCUMENT ${i + 1}: ${d.name}\n` + d.pages.map((p) => `=== PAGE ${p.page} ===\n${p.text.slice(0, 6000)}`).join("\n\n"))
    .join("\n\n");
  const prompt =
    "These are documents a bidder plans to submit with an Indian government tender. For each DOCUMENT n, give " +
    "docIndex = n, docType (what it is; 'other' if none fit), title, and these fields when the document states them " +
    "(null when it doesn't): issuer (who issued it), holder (who it is issued to / the authorized dealer or bidder), " +
    "manufacturer (the OEM, for authorization letters), productCategories (products or product families covered), " +
    "tenderReference (bid/tender number it is specific to), territory, issueDate and validUntil (as YYYY-MM-DD), " +
    "signatory (name and designation of who signed), certificateNumber, standard (e.g. ISO 9001:2015, IS 694). " +
    "For every non-null field add one evidence entry {field, page, quote} with the exact words from that document " +
    "that state it. Never infer a date, name or scope that isn't written. " +
    RULES_FOR_AI;
  const schema = {
    type: "OBJECT",
    properties: {
      documents: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            docIndex: { type: "INTEGER" },
            docType: { type: "STRING", enum: DOC_TYPES },
            title: S.strOrNull,
            issuer: S.strOrNull,
            holder: S.strOrNull,
            manufacturer: S.strOrNull,
            productCategories: { type: "ARRAY", items: S.str },
            tenderReference: S.strOrNull,
            territory: S.strOrNull,
            issueDate: S.strOrNull,
            validUntil: S.strOrNull,
            signatory: S.strOrNull,
            certificateNumber: S.strOrNull,
            standard: S.strOrNull,
            evidence: {
              type: "ARRAY",
              items: { type: "OBJECT", properties: { field: { type: "STRING", enum: SUPPORT_FIELDS }, page: S.intOrNull, quote: S.strOrNull }, required: ["field", "page", "quote"] },
            },
          },
          required: ["docIndex", "docType", "title", ...SUPPORT_FIELDS, "evidence"],
        },
      },
    },
    required: ["documents"],
  };
  return geminiRequest(prompt, input, schema);
}

// A6's answer checked into a fixed shape, keyed to the uploaded files by docIndex.
function toSupportingDocs(answer, docCount) {
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
  const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
  return ((answer && answer.documents) || [])
    .filter((d) => d && Number.isInteger(d.docIndex) && d.docIndex >= 1 && d.docIndex <= docCount)
    .map((d) => ({
      docIndex: d.docIndex,
      docType: DOC_TYPES.includes(d.docType) ? d.docType : "other",
      title: str(d.title),
      issuer: str(d.issuer),
      holder: str(d.holder),
      manufacturer: str(d.manufacturer),
      productCategories: Array.isArray(d.productCategories) ? d.productCategories.map(str).filter(Boolean).slice(0, 20) : [],
      tenderReference: str(d.tenderReference),
      territory: str(d.territory),
      issueDate: date(d.issueDate),
      validUntil: date(d.validUntil),
      signatory: str(d.signatory),
      certificateNumber: str(d.certificateNumber),
      standard: str(d.standard),
      evidence: (Array.isArray(d.evidence) ? d.evidence : [])
        .filter((e) => e && SUPPORT_FIELDS.includes(e.field) && Number.isInteger(e.page) && typeof e.quote === "string")
        .map((e) => ({ field: e.field, page: e.page, quote: e.quote })),
    }));
}

// Reads the JSON answer out of a Gemini response; throws a readable error if there isn't one.
function readGeminiJson(response, step) {
  const cand = response && response.candidates && response.candidates[0];
  const text = cand && cand.content && (cand.content.parts || []).map((p) => p.text || "").join("");
  if (!text) {
    const why = (cand && cand.finishReason) || (response && response.promptFeedback && response.promptFeedback.blockReason) || "empty answer";
    throw new Error(step + ": the AI gave no answer (" + why + ")");
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(step + ": the AI's answer was not valid JSON");
  }
}
