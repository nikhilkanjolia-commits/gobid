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
  await db.exec(readFileSync("supabase/002_categories_filters.sql", "utf8"));
  // Supabase provides auth.users; a minimal stand-in for the tests.
  await db.exec("create schema auth; create table auth.users (id uuid primary key, email text);");
  await db.exec(readFileSync("supabase/003_user_alerts.sql", "utf8"));
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
    const all = await search("tab => 'all'");
    expect(all).toHaveLength(10);
    expect(Number(all[0].total_count)).toBe(10);

    const mcb = await search("q => 'miniature circuit', tab => 'all'");
    expect(mcb.length).toBeGreaterThan(0);
    expect(mcb.every((r) => /miniature/i.test(r.items) && /circuit/i.test(r.items))).toBe(true);

    const one = await search(`q => '${all[3].bid_number}', tab => 'all'`);
    expect(one.map((r) => r.bid_number)).toEqual([all[3].bid_number]);

    expect(await search("q => 'zzznotathing', tab => 'all'")).toEqual([]);
  });

  it("sorts by publish date (default) or closing date, and pages", async () => {
    const byPublish = await search("tab => 'all'");
    const starts = byPublish.map((r) => r.starts_at.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => b - a));

    const byClosing = await search("tab => 'all', sort => 'closing_date_asc'");
    const ends = byClosing.map((r) => r.ends_at.getTime());
    expect(ends).toEqual([...ends].sort((a, b) => a - b));

    const page2 = await search("tab => 'all', sort => 'closing_date_asc', page_size => 3, page_offset => 3");
    expect(page2.map((r) => r.bid_number)).toEqual(byClosing.slice(3, 6).map((r) => r.bid_number));
    expect(Number(page2[0].total_count)).toBe(10);
  });

  it("hides closed bids by default and filters by closing dates", async () => {
    // Fix the dates relative to now, so the test doesn't depend on when it runs: all open, one closed.
    await db.query("update tenders set ends_at = now() + interval '2 days'");
    await db.query("update tenders set ends_at = now() - interval '1 day' where bid_number = (select min(bid_number) from tenders)");
    expect(await search("tab => 'live'")).toHaveLength(9);
    const window = await search("tab => 'all', closing_to => now() - interval '12 hours'");
    expect(window).toHaveLength(1);
  });

  it("keeps the tables closed to browser keys", async () => {
    const r = await db.query<{ rls: boolean }>("select relrowsecurity as rls from pg_class where relname = 'tenders'");
    expect(r.rows[0].rls).toBe(true);
    const can = await db.query<{ anon: boolean; service: boolean }>(
      "select has_function_privilege('anon', 'search_tenders(text,text,text,text[],text[],text,boolean,timestamptz,timestamptz,text,int,int)', 'execute') as anon, " +
        "has_function_privilege('service_role', 'search_tenders(text,text,text,text[],text[],text,boolean,timestamptz,timestamptz,text,int,int)', 'execute') as service",
    );
    expect(can.rows[0]).toEqual({ anon: false, service: true });
  });
});

describe("supabase/002_categories_filters.sql", () => {
  type Facets = {
    tabs: Record<string, number>;
    categories: { category: string; count: number }[];
    keywords: { keyword: string; count: number }[];
    ministries: { ministry: string; count: number }[];
    kinds: { BID: number; RA: number };
    last_run: { bids_new: number } | null;
  };
  const facets = async (args: string) => (await db.query<{ f: Facets }>(`select tender_facets(${args}) as f`)).rows[0].f;

  it("seeds the 18 collector keywords in categories, and hands the enabled ones to the collector", async () => {
    const all = (await db.query<{ keyword: string; category: string }>("select * from list_search_keywords()")).rows;
    expect(all).toHaveLength(18);
    expect(all.find((k) => k.keyword === "MCCB")?.category).toBe("Switchgear");
    await db.query("select save_search_keyword('UPS', 'Solar & Power', false, 2)");
    await db.query("select save_search_keyword('battery', 'Solar & Power', true, 1)");
    const collect = (await db.query<{ keyword: string; pages: number }>("select * from get_collect_keywords()")).rows;
    expect(collect.map((k) => k.keyword)).not.toContain("UPS");
    expect(collect.find((k) => k.keyword === "battery")?.pages).toBe(1);
    await db.query("select delete_search_keyword('battery')");
    await expect(db.query("select save_search_keyword('', 'X')")).rejects.toThrow("required");
  });

  it("filters by category, keyword, bid type and high value", async () => {
    // All 10 sample bids were found by "MCCB" (Switchgear); 2 also by "switchgear".
    const switchgear = await search("tab => 'all', p_categories => array['Switchgear']");
    expect(switchgear).toHaveLength(10);
    expect(await search("tab => 'all', p_categories => array['Solar & Power']")).toEqual([]);
    expect(await search("tab => 'all', p_keywords => array['switchgear']")).toHaveLength(2);
    const ras = await search("tab => 'all', p_kind => 'RA'");
    expect(ras.length).toBeGreaterThan(0);
    expect(ras.every((r) => r.bid_number.includes("/R/"))).toBe(true);
    expect(await search("tab => 'all', high_value_only => true")).toHaveLength(
      (await db.query<{ n: number }>("select count(*)::int as n from tenders where is_high_value")).rows[0].n,
    );
    const withCats = (await db.query<{ categories: string[] }>("select categories from search_tenders(tab => 'all', page_size => 1)")).rows[0];
    expect(withCats.categories).toEqual(["Switchgear"]);
  });

  it("puts bids in the right status tabs", async () => {
    await db.query("update tenders set ends_at = now() + interval '10 days', first_seen_at = now() - interval '3 days'");
    await db.query("update tenders set ends_at = now() + interval '1 day' where bid_number in (select bid_number from tenders order by bid_number limit 2)");
    await db.query("update tenders set ends_at = now() - interval '1 day' where bid_number = (select max(bid_number) from tenders)");
    await db.query("update tenders set first_seen_at = now() - interval '2 hours' where bid_number = (select min(bid_number) from tenders)");
    const f = await facets("tab => 'live'");
    expect(f.tabs).toEqual({ live: 9, closing_soon: 2, new: 1, closed: 1, all: 10 });
    expect(await search("tab => 'closing_soon'")).toHaveLength(2);
    expect(await search("tab => 'new'")).toHaveLength(1);
    expect(await search("tab => 'closed'")).toHaveLength(1);
  });

  it("counts categories, keywords, ministries and types for the filter panel", async () => {
    const f = await facets("tab => 'live'");
    expect(f.categories.find((c) => c.category === "Switchgear")?.count).toBe(9);
    expect(f.categories.find((c) => c.category === "Lighting")?.count).toBe(0);
    expect(f.keywords.find((k) => k.keyword === "MCCB")?.count).toBe(9);
    expect(f.kinds.BID + f.kinds.RA).toBe(9);
    expect(f.ministries.reduce((s, m) => s + m.count, 0)).toBeLessThanOrEqual(9);
    expect(f.last_run?.bids_new).toBe(0);
    // The search text narrows every count.
    const narrowed = await facets("q => 'zzznotathing', tab => 'live'");
    expect(narrowed.tabs.all).toBe(0);
  });
});

describe("supabase/003_user_alerts.sql", () => {
  const U1 = "11111111-1111-1111-1111-111111111111";
  const U2 = "22222222-2222-2222-2222-222222222222";
  type Recipient = { user_id: string; email: string; unsubscribe_token: string };

  it("saves and reads a user's alert choices", async () => {
    await db.exec(`insert into auth.users values ('${U1}', 'a@x.in'), ('${U2}', 'b@x.in')`);
    await db.query("select save_user_alerts($1, 'a@x.in', array['Switchgear'], array[]::text[], true)", [U1]);
    await db.query("select save_user_alerts($1, 'b@x.in', array[]::text[], array[]::text[], true)", [U2]);
    const a = (await db.query<{ categories: string[]; enabled: boolean }>("select * from get_user_alerts($1)", [U1])).rows[0];
    expect(a).toMatchObject({ categories: ["Switchgear"], enabled: true });
  });

  it("only emails users with something chosen, and not twice within 20 hours", async () => {
    let r = (await db.query<Recipient>("select * from get_digest_recipients()")).rows;
    expect(r.map((x) => x.email)).toEqual(["a@x.in"]); // b chose nothing
    await db.query("select mark_digest_sent($1)", [U1]);
    r = (await db.query<Recipient>("select * from get_digest_recipients()")).rows;
    expect(r).toEqual([]);
    await db.query("update user_alerts set last_sent_at = now() - interval '21 hours' where user_id = $1", [U1]);
    expect((await db.query<Recipient>("select * from get_digest_recipients()")).rows).toHaveLength(1);
  });

  it("finds new and closing-soon bids for the chosen categories or keywords", async () => {
    // From the 002 tests: 9 bids open (2 closing within a day), all found by "MCCB" (Switchgear).
    await db.query("update tenders set first_seen_at = now() - interval '2 hours' where bid_number in (select bid_number from tenders where ends_at > now() order by bid_number limit 3)");
    const rows = (await db.query<{ section: string }>("select section from digest_tenders(array['Switchgear'], array[]::text[], now() - interval '1 day')")).rows;
    expect(rows.filter((x) => x.section === "new")).toHaveLength(3);
    expect(rows.filter((x) => x.section === "closing_soon")).toHaveLength(2);
    expect((await db.query("select * from digest_tenders(array['Lighting'], array[]::text[], null)")).rows).toEqual([]);
    expect((await db.query("select * from digest_tenders(array[]::text[], array['MCCB'], now() - interval '1 day')")).rows.length).toBe(5);
  });

  it("unsubscribes with the email link's token", async () => {
    const token = (await db.query<{ unsubscribe_token: string }>("select unsubscribe_token from user_alerts where user_id = $1", [U1])).rows[0].unsubscribe_token;
    const off = (await db.query<{ e: string }>("select unsubscribe_alerts($1) as e", [token])).rows[0].e;
    expect(off).toBe("a@x.in");
    expect((await db.query<{ e: string | null }>("select unsubscribe_alerts('00000000-0000-0000-0000-000000000000') as e")).rows[0].e).toBeNull();
    expect((await db.query<Recipient>("select * from get_digest_recipients()")).rows).toEqual([]);
  });

  it("deletes a user's alerts when their account is deleted", async () => {
    await db.query("delete from auth.users where id = $1", [U2]);
    expect((await db.query("select * from user_alerts where user_id = $1", [U2])).rows).toEqual([]);
  });
});
