import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import collector from "../n8n/gobid-gem-collector.json";
import { loadN8nCode } from "./loadN8nCode";

type Search = { keyword: string; page: number; url: string; headers: Record<string, string>; body: string };
type Bid = {
  bid_number: string; gem_bid_id: number; bid_kind: string; items: string; quantity: number | null; ministry: string | null;
  department: string | null; starts_at: string | null; ends_at: string | null; document_url: string; matched_keywords: string[];
  is_high_value: boolean; has_boq: boolean;
};
const G = loadN8nCode<{
  GEM_KEYWORDS: string[];
  readGemSession: (html: string, cookies: string | string[]) => { csrf: string; cookie: string };
  buildGemSearches: (s: { csrf: string; cookie: string }, keywords?: string[], pages?: number) => Search[];
  parseGemSearch: (reply: unknown, keyword: string) => Bid[];
  mergeGemBids: (lists: Bid[][]) => Bid[];
  toTenderRows: (bids: Bid[], now: string) => (Bid & { source: string; last_seen_at: string })[];
}>("gem.js", ["GEM_KEYWORDS", "readGemSession", "buildGemSearches", "parseGemSearch", "mergeGemBids", "toTenderRows"]);

// A real reply from GeM's public search for "MCCB" (saved 22 Oct 2026).
const mccbReply = JSON.parse(readFileSync("tests/fixtures/gem-all-bids-mccb.json", "utf8"));
const PAGE_HTML = "<script>data: {'payload': JSON.stringify(postdata), 'csrf_bd_gem_nk': 'd31e4d9d35a31e41bf02f245b6b88aac'},</script>";
const SET_COOKIE = "csrf_gem_cookie=abc; path=/; secure, ci_session=xyz; expires=Thu, 22-Oct-2026 10:00:00 GMT; path=/, GeM=1; path=/";

describe("GeM session and searches", () => {
  it("reads the CSRF token and session cookies from the public page", () => {
    const s = G.readGemSession(PAGE_HTML, SET_COOKIE);
    expect(s.csrf).toBe("d31e4d9d35a31e41bf02f245b6b88aac");
    expect(s.cookie).toBe("csrf_gem_cookie=abc; ci_session=xyz; GeM=1");
  });

  it("fails loudly if the page no longer has a CSRF token", () => {
    expect(() => G.readGemSession("<html>maintenance</html>", "")).toThrow("CSRF token not found");
  });

  it("builds newest-first ongoing-bid searches for each keyword and page", () => {
    const searches = G.buildGemSearches({ csrf: "t0k", cookie: "a=1" }, ["MCB", "solar"], 2);
    expect(searches.map((s) => `${s.keyword}#${s.page}`)).toEqual(["MCB#1", "MCB#2", "solar#1", "solar#2"]);
    const body = new URLSearchParams(searches[1].body);
    expect(body.get("csrf_bd_gem_nk")).toBe("t0k");
    const payload = JSON.parse(body.get("payload")!);
    expect(payload).toMatchObject({ page: 2, param: { searchBid: "MCB" }, filter: { bidStatusType: "ongoing_bids", sort: "Bid-Start-Date-Latest" } });
    expect(searches[0].headers.cookie).toBe("a=1");
  });
});

describe("parseGemSearch on a real GeM reply", () => {
  const bids = G.parseGemSearch(mccbReply, "MCCB");

  it("reads every bid on the page with its key fields", () => {
    expect(bids).toHaveLength(10);
    for (const b of bids) {
      expect(b.bid_number).toMatch(/^GEM\/\d{4}\/[BR]\/\d+$/);
      expect(b.items.length).toBeGreaterThan(0);
      expect(b.matched_keywords).toEqual(["MCCB"]);
      expect(b.document_url).toMatch(/^https:\/\/bidplus\.gem\.gov\.in\/\w+\/\d+$/);
    }
  });

  it("stores GeM's times as India time, as its own page shows them", () => {
    const raw = mccbReply.response.response.docs[0].final_end_date_sort;
    expect(bids[0].ends_at).toBe(String(Array.isArray(raw) ? raw[0] : raw).replace("Z", "+05:30"));
  });

  it("labels reverse auctions and links their own document page", () => {
    const ra = bids.find((b) => b.bid_number.includes("/R/"));
    expect(ra?.bid_kind).toBe("RA");
    const bid = bids.find((b) => b.bid_number.includes("/B/"))!;
    expect(bid.bid_kind).toBe("BID");
    expect(bid.document_url).toBe(`https://bidplus.gem.gov.in/showbidDocument/${bid.gem_bid_id}`);
  });

  it("throws on an error reply instead of saving nothing silently", () => {
    expect(() => G.parseGemSearch({ code: 500, message: "error" }, "MCB")).toThrow("GeM search for 'MCB' failed");
  });
});

describe("mergeGemBids", () => {
  it("keeps one row per bid with every keyword that found it", () => {
    const a = G.parseGemSearch(mccbReply, "MCCB");
    const b = G.parseGemSearch(mccbReply, "switchgear").slice(0, 3);
    const merged = G.mergeGemBids([a, b]);
    expect(merged).toHaveLength(10);
    expect(merged[0].matched_keywords).toEqual(["MCCB", "switchgear"]);
    expect(merged[9].matched_keywords).toEqual(["MCCB"]);
  });
});

describe("GeM collector workflow (simulated run)", () => {
  it("plans the searches, merges replies and sends rows to Supabase", () => {
    const outputs: Record<string, { json: unknown }[]> = {};
    const $ = (name: string) => ({ all: () => outputs[name], first: () => outputs[name][0] });
    let previous: { json: unknown }[] = [];
    for (const node of collector.nodes) {
      const $input = { all: () => previous, first: () => previous[0] };
      if (node.type === "n8n-nodes-base.code") {
        previous = new Function("$", "$input", (node.parameters as { jsCode: string }).jsCode)($, $input);
      } else if (node.name === "GeM: open All Bids page") {
        previous = [{ json: { body: PAGE_HTML, headers: { "set-cookie": SET_COOKIE.split(", ") }, statusCode: 200 } }];
      } else if (node.name === "GeM: search bids") {
        previous = previous.map(() => ({ json: mccbReply })); // one reply per planned search
      } else if (node.name === "Supabase: save bids") {
        expect((node.parameters as { url: string }).url).toMatch(/\/rest\/v1\/rpc\/upsert_gem_tenders$/);
      } else {
        previous = [{ json: {} }];
      }
      outputs[node.name] = previous;
    }
    const plans = outputs["Plan searches"];
    expect(plans).toHaveLength(G.GEM_KEYWORDS.length * 2);
    const saved = outputs["Merge bids"][0].json as { rows: { matched_keywords: string[]; source: string }[]; requests: number };
    expect(saved.requests).toBe(plans.length + 1);
    expect(saved.rows).toHaveLength(10);
    expect(saved.rows[0].source).toBe("gem");
    expect(saved.rows[0].matched_keywords).toEqual(G.GEM_KEYWORDS);
  });
});
