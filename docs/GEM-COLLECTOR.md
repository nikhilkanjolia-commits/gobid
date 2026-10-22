# GeM tender search: how it works and how to switch it on

```
every hour   n8n "GoBid GeM collector"  →  POST https://<your site>/api/gem/collect  (header x-gobid-secret)
             the route, running on Vercel in Mumbai (bom1):
             1. opens bidplus.gem.gov.in/all-bids (public page, no login)
             2. searches 18 electrical/solar keywords, newest bids first, 2 pages each, 2 s apart (37 requests)
             3. merges the results (one row per bid, with the keywords that found it)
             4. saves them to Supabase with upsert_gem_tenders()
your site    GET /api/tenders?q=…  →  search_tenders() in Supabase  →  JSON results
```

**Why the GeM requests run on Vercel, not in n8n:** GeM refuses connections from servers outside India. A test from n8n Cloud failed with "The service refused the connection" (22 Oct 2026), while the same request from India worked. `vercel.json` therefore pins the site's functions to Mumbai (`bom1`), next to the Supabase database, and n8n only triggers the run.

- **Plain-code logic:** [`n8n/code/gem.js`](../n8n/code/gem.js), tested in `tests/gem.test.ts` against a real GeM reply. It's run by [`src/lib/gemCollector.ts`](../src/lib/gemCollector.ts) (the collect route) and by `scripts/gem-collect.mjs` (from your PC).
- **Collect route:** [`src/app/api/gem/collect/route.ts`](../src/app/api/gem/collect/route.ts). `?probe=1` only checks that GeM answers from the server.
- **Database:** [`supabase/schema.sql`](../supabase/schema.sql), tested on a real Postgres in `tests/schema.test.ts`.
- **Search API:** [`src/app/api/tenders/route.ts`](../src/app/api/tenders/route.ts).

## Staying within GeM's rules
- **Public pages only.** GoBid reads only the public "All Bids" search, the same request GeM's own page makes. It never logs in, never touches a captcha, and never downloads bid documents: `document_url` is a link for *you* to open.
- **Allowed by robots.txt.** Checked on 22 Oct 2026, `bidplus.gem.gov.in/robots.txt` only disallows `/resources/` and a few bank-guarantee pages. Check it again before increasing volume.
- **Light on GeM.** It runs hourly, one request at a time, 2 s apart, with a user-agent that names GoBid.
- **Not legal advice.** GeM's General Terms (GTC 3.0, s. 23(e)) forbid access to features "not specifically authorised". Have them reviewed before collecting at scale or selling the data.

## Switch it on (about 15 minutes)

1. **Create the database.** Sign up at https://supabase.com, then **New project** (free plan). Note the database password somewhere safe.
2. **Create the tables.** In the project: **SQL Editor → New query**, paste all of `supabase/schema.sql`, then **Run**. Then do the same with `supabase/002_categories_filters.sql`, which adds categories, editable collector keywords, status tabs and filter counts. Supabase warns about a "destructive operation": that's only the old search function being replaced.
3. **Copy two values:** **Project Settings → API**, the **Project URL** and the **service_role** key (secret: never in chat, code or GitHub).
4. **Set up the site, locally:** open `.env.local` and fill in `SUPABASE_URL=` and `SUPABASE_SERVICE_ROLE_KEY=`. Also set `GEM_COLLECT_SECRET=` to any long random value.
   **On Vercel:** **Project → Settings → Environment Variables**, add the same three (plus `GEMINI_API_KEY` / `GEMINI_MODEL` for tender analysis), then redeploy.
5. **Fill the database once from your PC:** `npm run gem:collect` (about 80 s). It prints e.g. `Saved: { received: 260, new: 260, updated: 0 }`.
6. **Try the search:** http://localhost:3000/api/tenders?q=solar&sort=closing_date_asc
7. **Run it every hour with n8n:**
   1. Import `n8n/gobid-gem-collector.json`: two steps, **Every hour** and **GoBid: collect GeM bids**.
   2. In **GoBid: collect GeM bids**, replace `YOUR-SITE` in the URL with your Vercel production address.
   3. Set its credential to a new **Header Auth** credential: Name `x-gobid-secret`, Value = your `GEM_COLLECT_SECRET`.
   4. Click **Execute workflow** once to test (about 80 s). It should answer `{ "region": "bom1", "new": …, "updated": … }`. Then **Publish** (or switch to **Active**).

## API

`GET /api/tenders`

| Parameter | Meaning | Default |
|---|---|---|
| `q` | words to find in items, ministry, department or bid number (all words must match), or part of an item name / bid number | — |
| `ministry` | part of the ministry name | — |
| `status` | `open` (closing date still ahead) or `all` | `open` |
| `closing_from`, `closing_to` | closing-date range, `YYYY-MM-DD` (India dates) | — |
| `sort` | `publish_date_desc`, `closing_date_asc`, `closing_date_desc` | `publish_date_desc` |
| `page`, `page_size` | page number, results per page (max 100) | 1, 20 |

Reply:
```json
{ "total": 132, "page": 1, "page_size": 20,
  "results": [{ "bid_number": "GEM/2026/B/8185771", "bid_kind": "BID", "items": "CONVERSION OF EXISTING OFF-GRID TO ON-GRID SOLAR",
                "quantity": 1, "ministry": "…", "department": "…", "starts_at": "2026-10-22T…+05:30", "ends_at": "…",
                "is_high_value": false, "has_boq": true, "document_url": "https://bidplus.gem.gov.in/showbidDocument/…",
                "matched_keywords": ["solar"], "first_seen_at": "…" }] }
```
Errors: `400` for a bad parameter (the message names it); `503` if Supabase isn't set up yet; `502` if Supabase fails.

## The website
- **Tenders (`/`):**
  - search and status tabs with counts: Live, Closing soon (≤ 3 days), New today, Closed, All
  - filter panel: category, keyword, ministry, bid or reverse auction, high value, closing dates
  - sort, cards with "days left", **View on GeM** and **Analyze**
  - every choice is kept in the page address
- **Analyze a tender (`/analyze`):** opened from a card, it shows that bid's GeM document link to download and upload.
- **Settings (`/settings`):**
  - *My preferences*: the filters Tenders opens with, saved in the browser.
  - *What GoBid collects from GeM*: add, switch off or remove keywords and categories. Changes need `ADMIN_PASSCODE` (in `.env.local` and Vercel).

## Changing what's collected
On **Settings → What GoBid collects from GeM** (admin passcode), or by editing the `search_keywords` table in Supabase. The next hourly run uses the change. At most 40 keywords can be on, which keeps one run under about 3 minutes. The list in `GEM_KEYWORDS` (`n8n/code/gem.js`) is only used if that table is missing.

Other API routes: `GET /api/tenders/facets?q=&tab=` (counts), `GET/POST/DELETE /api/keywords` (collector keywords; POST and DELETE need the header `x-gobid-admin`).

## Known limits
- **GeM's keyword search is loose.** "MCB" also finds bids where MCB is one item among paint or AC units. `matched_keywords` shows why a bid was found.
- **Only the newest 20 bids per keyword each hour.** On a very busy day, older new bids can be missed for keywords like "cable". Raise `GEM_PAGES_PER_KEYWORD` if that matters.
- **Only GeM so far.** CPPP and state portals would need their own collectors.
