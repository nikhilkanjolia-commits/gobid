import { readFileSync } from "node:fs";
import path from "node:path";

// Runs one GeM collection on the server: the same n8n/code/gem.js the tests check, fetched
// from wherever this code runs (Vercel Mumbai in production, since GeM refuses servers
// outside India). Fetching and saving are passed in, so tests can run it without a network.

type GemSession = { csrf: string; cookie: string };
type GemSearch = { keyword: string; page: number; url: string; headers: Record<string, string>; body: string };
type Gem = {
  GEM_BASE: string;
  GEM_USER_AGENT: string;
  GEM_REQUEST_GAP_MS: number;
  readGemSession: (html: string, setCookies: string[]) => GemSession;
  buildGemSearches: (s: GemSession, keywords?: string[], pages?: number) => GemSearch[];
  parseGemSearch: (reply: unknown, keyword: string) => unknown[];
  mergeGemBids: (lists: unknown[][]) => unknown[];
  toTenderRows: (bids: unknown[], nowIso: string) => unknown[];
};

let gem: Gem | null = null;
function loadGem(): Gem {
  if (!gem) {
    const src = readFileSync(path.join(process.cwd(), "n8n", "code", "gem.js"), "utf8");
    gem = new Function(
      `${src}\nreturn { GEM_BASE, GEM_USER_AGENT, GEM_REQUEST_GAP_MS, readGemSession, buildGemSearches, parseGemSearch, mergeGemBids, toTenderRows };`,
    )() as Gem;
  }
  return gem;
}

export type SaveResult = { received: number; new: number; updated: number };

export type CollectOptions = {
  fetch?: typeof fetch;
  save: (rows: unknown[], requests: number) => Promise<SaveResult>;
  keywords?: string[];
  pages?: number;
  gapMs?: number;
};

// Opens GeM's public page only, to check GeM answers from this server.
export async function probeGem(fetchImpl: typeof fetch = fetch) {
  const G = loadGem();
  const res = await fetchImpl(`${G.GEM_BASE}/all-bids`, { headers: { "user-agent": G.GEM_USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  const html = await res.text();
  return { status: res.status, csrfFound: /csrf_bd_gem_nk/.test(html) };
}

export async function collectGemBids(opts: CollectOptions) {
  const G = loadGem();
  const f = opts.fetch ?? fetch;
  const gap = opts.gapMs ?? G.GEM_REQUEST_GAP_MS;
  const started = Date.now();

  const page = await f(`${G.GEM_BASE}/all-bids`, { headers: { "user-agent": G.GEM_USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!page.ok) throw new Error(`GeM All Bids page answered ${page.status}`);
  const session = G.readGemSession(await page.text(), page.headers.getSetCookie());
  const searches = G.buildGemSearches(session, opts.keywords, opts.pages);

  const lists: unknown[][] = [];
  for (const [i, s] of searches.entries()) {
    if (i > 0 && gap > 0) await new Promise((r) => setTimeout(r, gap));
    const res = await f(s.url, { method: "POST", headers: s.headers, body: s.body, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`GeM search '${s.keyword}' page ${s.page} answered ${res.status}`);
    lists.push(G.parseGemSearch(await res.json(), s.keyword));
  }

  const rows = G.toTenderRows(G.mergeGemBids(lists), new Date().toISOString());
  const requests = searches.length + 1;
  const saved = await opts.save(rows, requests);
  return { ...saved, requests, seconds: Math.round((Date.now() - started) / 1000) };
}
