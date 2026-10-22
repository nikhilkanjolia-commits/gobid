// Reads GeM's public "All Bids" search (bidplus.gem.gov.in/all-bids) — the same request the
// public page makes, no login and no captcha — and turns results into rows for the database.
// Plain script: pasted into n8n Code nodes and loaded the same way by the tests.

const GEM_BASE = "https://bidplus.gem.gov.in";
const GEM_USER_AGENT = "GoBid/0.1 (tender search for small electrical contractors)";

// Searched newest-first every run. GeM's search matches item names and specs.
const GEM_KEYWORDS = [
  "MCB", "MCCB", "RCCB", "ACB", "LT panel", "distribution board", "switchgear", "cable", "wire",
  "LED", "street light", "high mast", "solar", "transformer", "earthing", "electrical", "UPS", "inverter",
];
const GEM_PAGES_PER_KEYWORD = 2; // 10 bids per page
// Delay between requests to GeM, in ms (n8n's HTTP node uses this as its batch interval).
const GEM_REQUEST_GAP_MS = 2000;

// From the all-bids page: the CSRF token the search needs, and the session cookies.
// setCookies: the page response's Set-Cookie header (string or array).
function readGemSession(html, setCookies) {
  const csrf = (String(html || "").match(/'csrf_bd_gem_nk'\s*:\s*'([0-9a-f]+)'/) || [])[1];
  if (!csrf) throw new Error("GeM page changed: CSRF token not found");
  const list = Array.isArray(setCookies) ? setCookies : String(setCookies || "").split(/,(?=\s*[A-Za-z0-9_]+=)/);
  const cookie = list.map((c) => String(c).split(";")[0].trim()).filter(Boolean).join("; ");
  return { csrf: csrf, cookie: cookie };
}

// One search request per keyword per page, newest bids first.
function buildGemSearches(session, keywords, pages) {
  const out = [];
  for (const keyword of keywords || GEM_KEYWORDS) {
    for (let page = 1; page <= (pages || GEM_PAGES_PER_KEYWORD); page++) {
      const payload = {
        page: page,
        param: { searchBid: keyword, searchType: "fullText" },
        filter: { bidStatusType: "ongoing_bids", byType: "all", highBidValue: "", byEndDate: { from: "", to: "" }, sort: "Bid-Start-Date-Latest" },
      };
      out.push({
        keyword: keyword,
        page: page,
        url: GEM_BASE + "/all-bids-data",
        headers: {
          "user-agent": GEM_USER_AGENT,
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          referer: GEM_BASE + "/all-bids",
          cookie: session.cookie,
        },
        body: "payload=" + encodeURIComponent(JSON.stringify(payload)) + "&csrf_bd_gem_nk=" + encodeURIComponent(session.csrf),
      });
    }
  }
  return out;
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

// GeM sends "2026-10-24T14:00:00Z" but means 2:00 PM India time (its own page shows the
// UTC fields as-is), so the "Z" is replaced with +05:30.
function gemTime(v) {
  const s = first(v);
  if (!s) return null;
  return String(s).replace(/Z$/, "+05:30");
}

function documentPath(d) {
  const type = Number(first(d.b_bid_type));
  if (type === 5) return "/showdirectradocumentPdf/";
  if (type === 2) return Number(first(d.b_eval_type)) > 0 ? "/list-ra-schedules/" : "/showradocumentPdf/";
  return "/showbidDocument/";
}

// One search reply → normalized bid rows. Throws if GeM answered with an error.
function parseGemSearch(reply, keyword) {
  if (!reply || Number(reply.code) !== 200 || !reply.response || !reply.response.response) {
    throw new Error("GeM search for '" + keyword + "' failed (code " + (reply && reply.code) + ")");
  }
  return (reply.response.response.docs || [])
    .map((d) => {
      const bidNumber = first(d.b_bid_number);
      const gemId = first(d.b_id);
      if (!bidNumber || gemId == null) return null;
      const type = Number(first(d.b_bid_type));
      return {
        bid_number: String(bidNumber),
        gem_bid_id: Number(gemId),
        bid_kind: type === 2 || type === 5 ? "RA" : "BID",
        parent_bid_number: first(d.b_bid_number_parent) || null,
        items: String(first(d.b_category_name) || "").trim(),
        quantity: first(d.b_total_quantity) == null ? null : Number(first(d.b_total_quantity)),
        ministry: first(d.ba_official_details_minName) || null,
        department: first(d.ba_official_details_deptName) || null,
        starts_at: gemTime(d.final_start_date_sort),
        ends_at: gemTime(d.final_end_date_sort),
        is_high_value: Number(first(d.is_high_value)) === 1,
        has_boq: Number(first(d.bd_details_is_boq)) === 1,
        document_url: GEM_BASE + documentPath(d) + gemId,
        matched_keywords: [keyword],
      };
    })
    .filter(Boolean);
}

// Joins rows from all searches: one row per bid, with every keyword that found it.
function mergeGemBids(rowLists) {
  const byNumber = new Map();
  for (const row of [].concat.apply([], rowLists || [])) {
    const seen = byNumber.get(row.bid_number);
    if (!seen) byNumber.set(row.bid_number, Object.assign({}, row, { matched_keywords: row.matched_keywords.slice() }));
    else for (const k of row.matched_keywords) if (!seen.matched_keywords.includes(k)) seen.matched_keywords.push(k);
  }
  return Array.from(byNumber.values());
}

// Rows ready for the Supabase upsert, stamped with this run's time.
function toTenderRows(bids, nowIso) {
  return bids.map((b) => Object.assign({ source: "gem", last_seen_at: nowIso }, b));
}
