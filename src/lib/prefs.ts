// "My preferences": default filters saved in this browser only (no login needed).
// Applied when the Tenders page opens without filters in its address.
export type Prefs = { category: string[]; keyword: string[]; ministry?: string; sort?: string; page_size?: number };

const KEY = "gobid.prefs.v1";

export function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { category: Array.isArray(p.category) ? p.category : [], keyword: Array.isArray(p.keyword) ? p.keyword : [], ministry: p.ministry, sort: p.sort, page_size: p.page_size };
  } catch {
    return null;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function clearPrefs() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing saved, nothing to clear.
  }
}

// Turns preferences into the Tenders page's address (URL query).
export function prefsToParams(p: Prefs) {
  const sp = new URLSearchParams();
  if (p.category.length) sp.set("category", p.category.join(","));
  if (p.keyword.length) sp.set("keyword", p.keyword.join(","));
  if (p.ministry) sp.set("ministry", p.ministry);
  if (p.sort) sp.set("sort", p.sort);
  if (p.page_size) sp.set("page_size", String(p.page_size));
  return sp;
}
