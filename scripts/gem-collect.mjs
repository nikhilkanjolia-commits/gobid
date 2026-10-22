// Runs the GeM collector once from your PC, using the same n8n/code/gem.js the n8n workflow
// runs. Use it to test, or as a backup if n8n is down.
//   node scripts/gem-collect.mjs --dry-run           fetch and print, save nothing
//   node --env-file=.env.local scripts/gem-collect.mjs   fetch and save to Supabase
// Options: --keywords "MCB,solar" --pages 1
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");

const src = readFileSync(new URL("../n8n/code/gem.js", import.meta.url), "utf8");
const G = new Function(
  `${src}\nreturn { GEM_BASE, GEM_USER_AGENT, GEM_KEYWORDS, GEM_REQUEST_GAP_MS, readGemSession, buildGemSearches, parseGemSearch, mergeGemBids, toTenderRows };`,
)();

const keywords = opt("--keywords") ? opt("--keywords").split(",").map((k) => k.trim()) : G.GEM_KEYWORDS;
const pages = opt("--pages") ? Number(opt("--pages")) : undefined;

const page = await fetch(`${G.GEM_BASE}/all-bids`, { headers: { "user-agent": G.GEM_USER_AGENT } });
const session = G.readGemSession(await page.text(), page.headers.getSetCookie());
const searches = G.buildGemSearches(session, keywords, pages);
console.log(`Searching GeM: ${searches.length} requests, ${G.GEM_REQUEST_GAP_MS / 1000}s apart…`);

const lists = [];
for (const [i, s] of searches.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, G.GEM_REQUEST_GAP_MS));
  const res = await fetch(s.url, { method: "POST", headers: s.headers, body: s.body });
  const rows = G.parseGemSearch(await res.json(), s.keyword);
  lists.push(rows);
  console.log(`  ${s.keyword} p${s.page}: ${rows.length} bids`);
}
const bids = G.toTenderRows(G.mergeGemBids(lists), new Date().toISOString());
console.log(`\n${bids.length} unique bids.`);

if (dryRun) {
  for (const b of bids.slice(0, 8)) {
    console.log(`- ${b.bid_number} | closes ${b.ends_at} | ${b.ministry ?? "?"} | ${b.items.slice(0, 70)} | [${b.matched_keywords.join(", ")}]`);
  }
  console.log("\nDry run: nothing saved.");
} else {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local), or use --dry-run");
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/upsert_gem_tenders`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({ rows: bids, requests: searches.length + 1 }),
  });
  if (!res.ok) throw new Error(`Saving to Supabase failed (${res.status}): ${await res.text()}`);
  console.log("Saved:", await res.json());
}
