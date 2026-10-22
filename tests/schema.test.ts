import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { loadN8nCode } from "./loadN8nCode";

// Runs supabase/schema.sql in a real (in-memory) Postgres and checks the save and search
// functions with bids parsed from a real GeM reply.
const G = loadN8nCode<{
  parseGemSearch: (reply: unknown, keyword: string) => Record<string, unknown>[];
  toTenderRows: (bids: Record<string, unknown>[], now: string) => Record<string, unknown>[];
}>("gem.js", ["parseGemSearch", "toTenderRows"]);
const reply = JSON.parse(readFileSync("tests/fixtures/gem-all-bids-mccb.json", "utf8"));

type Found = { bid_number: string; items: string; ends_at: Date; starts_at: Date; matched_keywords: string[]; total_count: number };

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  // Roles Supabase provides; the schema grants and revokes on them.
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
}, 60_000);

async function save(rows: Record<string, unknown>[]) {
  const r = await db.query<{ r: { received: number; new: number; updated: number } }>(
    "select upsert_gem_tenders($1::jsonb, 21) as r",
    [JSON.stringify(rows)],
  );
  return r.rows[0].r;
}

async function search(args: string) {
  return (await db.query<Found>(`select * from search_tenders(${args})`)).rows;
}

describe("supabase/schema.sql", () => {
  it("saves new bids, then updates them and merges keywords on the next run", async () => {
    const run1 = G.toTenderRows(G.parseGemSearch(reply, "MCCB"), "2026-10-22T09:00:00Z");
    expect(await save(run1)).toEqual({ received: 10, new: 10, updated: 0 });

    const run2 = G.toTenderRows(G.parseGemSearch(reply, "switchgear").slice(0, 2), "2026-10-22T10:00:00Z");
    expect(await save(run2)).toEqual({ received: 2, new: 0, updated: 2 });

    const row = (await db.query<{ matched_keywords: string[]; first_seen_at: Date; last_seen_at: Date }>(
      "select matched_keywords, first_seen_at, last_seen_at from tenders where bid_number = $1",
      [run2[0].bid_number],
    )).rows[0];
    expect(row.matched_keywords).toEqual(["MCCB", "switchgear"]);
    expect(row.first_seen_at.toISOString()).toBe("2026-10-22T09:00:00.000Z");
    expect(row.last_seen_at.toISOString()).toBe("2026-10-22T10:00:00.000Z");

    const runs = await db.query<{ n: number }>("select count(*)::int as n from collector_runs");
    expect(runs.rows[0].n).toBe(2);
  });

  it("searches words, substrings and bid numbers, with a total count", async () => {
    const all = await search("open_only => false");
    expect(all).toHaveLength(10);
    expect(Number(all[0].total_count)).toBe(10);

    const mcb = await search("q => 'miniature circuit', open_only => false");
    expect(mcb.length).toBeGreaterThan(0);
    expect(mcb.every((r) => /miniature/i.test(r.items) && /circuit/i.test(r.items))).toBe(true);

    const one = await search(`q => '${all[3].bid_number}', open_only => false`);
    expect(one.map((r) => r.bid_number)).toEqual([all[3].bid_number]);

    expect(await search("q => 'zzznotathing', open_only => false")).toEqual([]);
  });

  it("sorts by publish date (default) or closing date, and pages", async () => {
    const byPublish = await search("open_only => false");
    const starts = byPublish.map((r) => r.starts_at.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => b - a));

    const byClosing = await search("open_only => false, sort => 'closing_date_asc'");
    const ends = byClosing.map((r) => r.ends_at.getTime());
    expect(ends).toEqual([...ends].sort((a, b) => a - b));

    const page2 = await search("open_only => false, sort => 'closing_date_asc', page_size => 3, page_offset => 3");
    expect(page2.map((r) => r.bid_number)).toEqual(byClosing.slice(3, 6).map((r) => r.bid_number));
    expect(Number(page2[0].total_count)).toBe(10);
  });

  it("hides closed bids by default and filters by closing dates", async () => {
    // Fix the dates relative to now, so the test doesn't depend on when it runs: all open, one closed.
    await db.query("update tenders set ends_at = now() + interval '2 days'");
    await db.query("update tenders set ends_at = now() - interval '1 day' where bid_number = (select min(bid_number) from tenders)");
    expect(await search("")).toHaveLength(9);
    const window = await search("open_only => false, closing_to => now() - interval '12 hours'");
    expect(window).toHaveLength(1);
  });

  it("keeps the tables closed to browser keys", async () => {
    const r = await db.query<{ rls: boolean }>("select relrowsecurity as rls from pg_class where relname = 'tenders'");
    expect(r.rows[0].rls).toBe(true);
    const can = await db.query<{ anon: boolean; service: boolean }>(
      "select has_function_privilege('anon', 'search_tenders(text,text,boolean,timestamptz,timestamptz,text,int,int)', 'execute') as anon, " +
        "has_function_privilege('service_role', 'search_tenders(text,text,boolean,timestamptz,timestamptz,text,int,int)', 'execute') as service",
    );
    expect(can.rows[0]).toEqual({ anon: false, service: true });
  });
});
