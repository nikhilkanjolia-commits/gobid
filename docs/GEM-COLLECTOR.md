# GeM tender search: how it works and how to switch it on

```
every hour   n8n "GoBid GeM collector"
             1. opens bidplus.gem.gov.in/all-bids (public page, no login)
             2. searches 18 electrical/solar keywords, newest bids first, 2 pages each, 2 s apart (37 requests)
             3. merges the results (one row per bid, with the keywords that found it)
             4. saves them to Supabase with upsert_gem_tenders()
your site    GET /api/tenders?q=…  →  search_tenders() in Supabase  →  JSON results
```

- **Plain-code logic:** [`n8n/code/gem.js`](../n8n/code/gem.js). It's tested in `tests/gem.test.ts` against a real GeM reply, and the n8n Code nodes run this exact file.
- **Database:** [`supabase/schema.sql`](../supabase/schema.sql), tested on a real Postgres in `tests/schema.test.ts`.
- **Search API:** [`src/app/api/tenders/route.ts`](../src/app/api/tenders/route.ts).

## Staying within GeM's rules
- **Public pages only.** GoBid reads only the public "All Bids" search, the same request GeM's own page makes. It never logs in, never touches a captcha, and never downloads bid documents: `document_url` is a link for *you* to open.
- **Allowed by robots.txt.** Checked on 22 Oct 2026, `bidplus.gem.gov.in/robots.txt` only disallows `/resources/` and a few bank-guarantee pages. Check it again before increasing volume.
- **Light on GeM.** It runs hourly, one request at a time, 2 s apart, with a user-agent that names GoBid.
- **Not legal advice.** GeM's General Terms (GTC 3.0, s. 23(e)) forbid access to features "not specifically authorised". Have them reviewed before collecting at scale or selling the data.

## Switch it on (about 15 minutes)

1. **Create the database.** Sign up at https://supabase.com, then **New project** (free plan). Note the database password somewhere safe.
2. **Create the tables.** In the project: **SQL Editor → New query**, paste all of `supabase/schema.sql`, then **Run**.
3. **Copy two values:** **Project Settings → API**, the **Project URL** and the **service_role** key (secret: never in chat, code or GitHub).
4. **Set up the site, locally:** open `.env.local` and fill in `SUPABASE_URL=` and `SUPABASE_SERVICE_ROLE_KEY=`.
   **On Vercel:** **Project → Settings → Environment Variables**, add the same two, then redeploy.
5. **Fill the database once from your PC:** `npm run gem:collect` (about 75 s). It prints e.g. `Saved: { received: 260, new: 260, updated: 0 }`.
6. **Try the search:** http://localhost:3000/api/tenders?q=solar&sort=closing_date_asc
7. **Run it every hour with n8n:**
   1. Import `n8n/gobid-gem-collector.json`.
   2. Open **Supabase: save bids** and replace `YOUR-PROJECT` in the URL with your project URL.
   3. In the same node, create a **Supabase API** credential with the same URL and service_role key.
   4. Click **Execute workflow** once to test, then switch the workflow **Active**.

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

## Changing what's collected
Edit `GEM_KEYWORDS` or `GEM_PAGES_PER_KEYWORD` in `n8n/code/gem.js`, run `npm test` and `npm run build:n8n`, then re-import the collector in n8n.

## Known limits
- **GeM's keyword search is loose.** "MCB" also finds bids where MCB is one item among paint or AC units. `matched_keywords` shows why a bid was found.
- **Only the newest 20 bids per keyword each hour.** On a very busy day, older new bids can be missed for keywords like "cable". Raise `GEM_PAGES_PER_KEYWORD` if that matters.
- **Only GeM so far.** CPPP and state portals would need their own collectors.
