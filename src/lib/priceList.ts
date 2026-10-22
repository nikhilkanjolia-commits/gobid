import Papa from "papaparse";

// One SKU from a supplier price list, after validation.
export type PriceRow = {
  sku: string;
  description: string;
  brand: string;
  unit: string;
  listPrice: number;
  discountPct: number;
  ratingKA: number | null;
  poles: number | null;
  source: string;
};

export type PriceListResult = { rows: PriceRow[]; errors: string[]; warnings: string[] };

const MAX_LISTED_ERRORS = 10;

// Column names we accept for each field (after lowercasing and turning spaces into "_").
const COLUMNS: Record<keyof Omit<PriceRow, "source">, { required: boolean; names: string[] }> = {
  sku: { required: true, names: ["sku", "code", "item_code", "cat_no", "catalogue_no", "catalog_no", "part_no"] },
  description: { required: true, names: ["description", "item_description", "desc"] },
  brand: { required: true, names: ["brand", "make", "manufacturer"] },
  unit: { required: true, names: ["unit", "uom"] },
  listPrice: { required: true, names: ["list_price", "listprice", "price", "mrp", "rate"] },
  discountPct: { required: true, names: ["discount_pct", "discount", "discount_%", "disc", "disc_%"] },
  ratingKA: { required: false, names: ["rating_ka", "ka", "breaking_capacity_ka"] },
  poles: { required: false, names: ["poles", "pole"] },
};

function normHeader(h: string) {
  return h.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

// "₹1,234.50" → 1234.5; empty → null; anything else that isn't a number → NaN.
function parseNumber(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[₹,\s]/g, "").replace(/%$/, "");
  if (s === "") return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export function parsePriceList(fileName: string, csvText: string): PriceListResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!csvText.trim()) return { rows: [], errors: [`${fileName}: the file is empty`], warnings };

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normHeader,
  });

  const headers = parsed.meta.fields ?? [];
  const columnFor = {} as Record<keyof typeof COLUMNS, string | undefined>;
  for (const [field, spec] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, (typeof COLUMNS)[keyof typeof COLUMNS]][]) {
    columnFor[field] = spec.names.find((n) => headers.includes(n));
    if (spec.required && !columnFor[field]) {
      errors.push(`${fileName}: missing column "${spec.names[0]}" (found: ${headers.join(", ") || "none"})`);
    }
  }
  if (errors.length) return { rows: [], errors, warnings };
  if (parsed.data.length === 0) return { rows: [], errors: [`${fileName}: no price rows under the header`], warnings };

  const rowErrors: string[] = [];
  for (const e of parsed.errors) {
    // Papa's row index is 0-based and excludes the header; +2 gives the line number in the file.
    rowErrors.push(`${fileName} line ${(e.row ?? 0) + 2}: ${e.message}`);
  }

  const rows: PriceRow[] = [];
  parsed.data.forEach((rec, i) => {
    const line = i + 2;
    const get = (f: keyof typeof COLUMNS) => (columnFor[f] ? String(rec[columnFor[f]!] ?? "").trim() : "");
    const problems: string[] = [];

    for (const f of ["sku", "description", "brand", "unit"] as const) {
      if (!get(f)) problems.push(`${columnFor[f]} is empty`);
    }
    const listPrice = parseNumber(get("listPrice"));
    if (listPrice == null || Number.isNaN(listPrice) || listPrice <= 0) {
      problems.push(`${columnFor.listPrice} "${get("listPrice")}" is not a positive number`);
    }
    const discountPct = parseNumber(get("discountPct"));
    if (discountPct == null || Number.isNaN(discountPct) || discountPct < 0 || discountPct >= 100) {
      problems.push(`${columnFor.discountPct} "${get("discountPct")}" must be a number from 0 to 99`);
    }
    const ratingKA = parseNumber(get("ratingKA"));
    const poles = parseNumber(get("poles"));
    if (Number.isNaN(ratingKA)) problems.push(`${columnFor.ratingKA} "${get("ratingKA")}" is not a number`);
    if (Number.isNaN(poles)) problems.push(`${columnFor.poles} "${get("poles")}" is not a number`);

    if (problems.length) {
      rowErrors.push(`${fileName} line ${line}: ${problems.join("; ")}`);
      return;
    }
    rows.push({
      sku: get("sku"),
      description: get("description"),
      brand: get("brand"),
      unit: get("unit"),
      listPrice: listPrice!,
      discountPct: discountPct!,
      ratingKA,
      poles,
      source: fileName,
    });
  });

  if (rowErrors.length) {
    const shown = rowErrors.slice(0, MAX_LISTED_ERRORS);
    if (rowErrors.length > MAX_LISTED_ERRORS) shown.push(`${fileName}: …and ${rowErrors.length - MAX_LISTED_ERRORS} more problems`);
    return { rows: [], errors: shown, warnings };
  }
  return { rows, errors, warnings };
}

// Combines 1–2 checked price lists. A SKU code that appears twice is a warning, and the
// first one wins, so a match always points at one price.
export function mergePriceLists(lists: PriceListResult[]): PriceListResult {
  const errors = lists.flatMap((l) => l.errors);
  const warnings = lists.flatMap((l) => l.warnings);
  const seen = new Map<string, PriceRow>();
  for (const row of lists.flatMap((l) => l.rows)) {
    const key = row.sku.toLowerCase();
    const first = seen.get(key);
    if (first) warnings.push(`SKU ${row.sku} appears in both ${first.source} and ${row.source}; using ${first.source}`);
    else seen.set(key, row);
  }
  return { rows: errors.length ? [] : [...seen.values()], errors, warnings };
}
