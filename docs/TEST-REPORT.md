# GoBid test report — 22 Oct 2026

## Round 2 (after fixes): all 3 tests pass

| Test | Tender A (150 p) | Tender B (64 p) |
|---|---|---|
| **1. Go/No-Go + eligibility with page + quote** | **PASS**: 98 s, REVIEW NEEDED. 6 clauses pass with page + quote. EMD now correctly says "EMD exempt for MSEs (p. 2)". The approved-makes row is **UNKNOWN** because the AI cited p. 131 for a quote that's on p. 86; the quote check caught it ("Quote is on page 86, not page 131"). | **PASS**: 47 s, NO-GO for exactly the expected reasons: "OEM authorization (MAF): Needs authorization from L&T; firm holds Havells, Polycab (p. 24); Certificate: ISO 14001 expired on 2026-05-31 (p. 2)". Experience **passes**; EMD reads "Arrange EMD of ₹62,800". |
| **2. Priced BOQ, flags, .xlsx** | **PASS**: all 28 quantities correct (`1=120 2=180 … 28=250`). **24 of 28 priced**. Cost total **₹14,68,838.20** = the hand calculation for those 24 lines. 4 lines flagged 🟡 "No matching SKU" (50 kA MCCB, earth pit, cable tray, street light). | **PASS**: 13 of 14 priced, **₹5,97,253** (= hand sum). Line 7 🔴 "Printed amount 184250 ≠ qty × rate (174250)". LT panel 🟡 unmatched. **0** false approved-make flags (were 7). |
| **3. Bad input → clear error, never a fake pass** | **PASS**: scanned PDF and broken CSV blocked; `analyzeDisabled: true`, `apiCallsAfterClick: 0`. The demo's invented quote still shows `UNKNOWN Quote not found on page 3`. | |

Screenshot: [round2-tender-A-review-needed.jpg](test-report/round2-tender-A-review-needed.jpg). Exact screen output from the runs:
```
Tender A: REVIEW NEEDED. Review needed before deciding. Approved makes: Quote is on page 86, not page 131; check the tender manually (p. 131); 4 BOQ line(s) could not be priced.
          0 failed · 1 unknown · 6 passed · 0 red and 4 amber BOQ lines · 150 pages read in 98s
          Cost total ₹14,68,838.20 · Lines priced 24 of 28
Tender B: NO-GO. OEM authorization (MAF): Needs authorization from L&T; firm holds Havells, Polycab (p. 24); Certificate: ISO 14001 expired on 2026-05-31 (p. 2).
          2 failed · 0 unknown · 5 passed · 1 red and 1 amber BOQ lines · 64 pages read in 47s
          Cost total ₹5,97,253 · Lines priced 13 of 14
Test 3:   { analyzeDisabled: true, apiCallsAfterClick: 0, messages: ["✗ This PDF has no readable text; it looks scanned…", "✗ bad-price-list.csv: missing column \"discount_pct\"…"] }
```
Automated: **72 unit tests pass**, including `tests/regression.test.ts`. It replays both failures on the real PDFs: Tender A with every AI quantity removed must give 25 priced lines and exactly the `expected.json` total (₹14,85,974.20); Tender B with the AI's "years: 7" mistake must pass experience.

### The failures (bug reports)

**Test 2 failed: Tender A priced nothing.**
- **What I did:** opened http://localhost:3000. Under "1. Tender PDF", picked `public/test-tenders/tender-A-gem-hospital-150p.pdf` ("✓ 150 pages of text read"). Kept the sample price lists. Clicked **3. Analyze tender**.
- **What I expected (expected.json):** 28 BOQ lines; 25 priced at a cost total of ₹14,85,974.20; the 50 kA MCCB flagged; 3 lines unmatched.
- **What happened:** `Lines priced 0 of 28`, and on every line: `🔴 Quantity or unit could not be extracted reliably; not priced`. SKUs and units were right; every quantity was empty.

**Test 1 failed: Tender B's NO-GO gave a false reason.**
- **What I did:** same screen. Picked `public/test-tenders/tender-B-cpwd-polytechnic-64p.pdf` ("✓ 64 pages of text read"). Sample price lists. Clicked **3. Analyze tender**.
- **What I expected:** experience PASS (one ₹42 lakh work ≥ ₹40 lakh); NO-GO only for ISO 14001 (p. 2) and L&T (p. 24); EMD "Arrange ₹62,800".
- **What happened:** `NO-GO. Past experience: needs 7 years, firm has 6 (p. 2); …`, plus `EMD amount could not be read from the tender` beside the quote "Earnest Money: Rs. 62,800", and 7 lines with `🟡 Havells is not in the tender's approved makes (L&T, Polycab, KEI)`.

### Root causes and fixes

| Root cause | Symptoms it caused | Fix |
|---|---|---|
| **Optional fields in the AI answer format.** On long inputs, Gemini quietly leaves out fields the format doesn't require. | Tender A: every quantity empty. Tender B: EMD amount missing, and the "N works of ₹X" options missing (so only "years" was left). | Every field in the BOQ and eligibility answers is now **required** (null allowed). Eligibility answers are one flat object per clause, turned back into the rules' format by `toClauses()` (`n8n/code/requests.js`). |
| **Quantities trusted to the AI alone.** | Any AI slip in a number goes straight into pricing. | Plain code now reads the unit and quantity from the **printed line** the AI's quote points to (`readBoqLines` in `n8n/code/verifyQuotes.js`). It fills a missing quantity, flags 🔴 when the AI's number differs from the page, and refuses to guess when two lines start with the same words. |
| **No place for a "look-back period".** "Completed during the last seven years" was read as "needs 7 years of experience". | False experience FAIL in a NO-GO headline. | The answer has a separate `lookbackYears` field and the prompt explains the difference. The rules also ignore `years` when it equals a "during the last N years" window in the quote (`isLookbackYears` in `rules.js`). |
| **Only the first MSE-exemption clause was read.** Tenders state the EMD exemption and the experience/turnover exemption on separate lines. | "Arrange EMD ₹97,200" directly above "EMD: yes (exempt)". | Each exemption is taken from whichever verified clause states it (`mseExemptions` in `rules.js`). |
| **Approved makes applied to every line.** The brand lists from all groups were merged into one list. | False 🟡 on every Havells MCB because the cables/panel list didn't include Havells. | Each BOQ line is checked only against the approved-makes **group it belongs to** (`groupForLine` in `matchChecks.js`). An "LED panel" isn't an "LT panel". |

### Still open (not test failures)
- The margin is always 13.05%, because it is the firm's 15% markup restated.
- The free Gemini tier is slow under load: Tender A took 98 s with retries, against 53 s in round 1. It's limited to 5 requests a minute plus a daily cap.
- An AI page miscitation (approved makes, Tender A) turns into UNKNOWN. That's safe, but the verdict becomes REVIEW NEEDED.
- n8n isn't connected yet; the app runs in direct mode. `n8n/gobid-workflow.json` is regenerated and simulated in tests.

---

## Round 1 (before fixes)

The app was run in the local preview (`npm run dev`) in direct mode, calling Gemini (`gemini-3.1-flash-lite`, free tier) with the key in `.env.local`. It used the sample firm in `data/firm-profile.json` and the sample price lists in `public/samples/`. No code was changed for this report.

The inputs live in [`public/test-tenders/`](../public/test-tenders) and are made by `node scripts/make-test-tenders.mjs`. The answer key, written before the runs, is in [`expected.json`](../public/test-tenders/expected.json).

| Input | What it is |
|---|---|
| `tender-A-gem-hospital-150p.pdf` | Made-up GeM-style bid: 150 pages. Eligibility is on p. 2, 3, 86 and 131; the 28-line BOQ (quantities only) is on p. 140–145. |
| `tender-B-cpwd-polytechnic-64p.pdf` | Made-up CPWD-style NIT: 64 pages. Eligibility is written as prose (p. 2, 3, 24); the 14-line BOQ with estimated rates is on p. 55–56, and line 7 has a deliberate arithmetic error. |
| `bad-scanned-tender.pdf` | 12 image-only pages with no text (like a scan). |
| `bad-price-list.csv` | Missing the `discount_pct` column; one price says "on request". |

## Results

| Test | Tender A (150 p) | Tender B (64 p) |
|---|---|---|
| **1. Go/No-Go + eligibility with page + quote in about 2 min** | **PASS**: 53 s. All 7 clauses right, each with page + exact quote (p. 2, 3, 86, 131). Verdict REVIEW NEEDED, as expected. | **FAIL**: 38 s, and NO-GO is right, but **experience is wrongly marked FAIL** ("needs 7 years, firm has 6"). The AI read "during the last seven years" as a 7-year requirement; the firm actually qualifies with one ₹42 lakh work. EMD shows *unknown* although the amount is in the quote. |
| **2. Priced BOQ, SKU matching, flags, .xlsx** | **FAIL**: **0 of 28 lines priced**. Every line got "Quantity or unit could not be extracted reliably". Units and SKU matches are right (27 of 28 correct SKUs), but every quantity came back empty. | **PASS**: 13 of 14 priced. The cost total **₹5,97,253** matches a hand sum of the 13 lines. Line 7's printed-amount error is flagged 🔴 ("184250 ≠ qty × rate (174250)"). The LT panel is correctly unmatched. |

| Test | Bad input | Result |
|---|---|---|
| **3. Bad input → clear error, never a fake pass** | Scanned PDF + broken CSV | **PASS**: "✗ This PDF has no readable text; it looks scanned…" and "✗ bad-price-list.csv: missing column "discount_pct" (found: sku, description, brand, unit, list_price)". Analyze stays disabled, and **0** requests reached the server. |
| | Unverifiable AI output (seen in the runs) | **PASS**: Tender B's EMD, where the AI gave no amount, shows **UNKNOWN**, not pass, and the verdict didn't treat it as passed. The demo's invented licence quote shows **UNKNOWN** ("Quote not found on page 3"). |

### Proof (exact screen output)

**Tender A, verdict and BOQ** (screenshot: [test1-2-tender-A-review-needed.jpg](test-report/test1-2-tender-A-review-needed.jpg)):
```
REVIEW NEEDED
Review needed before deciding. 28 BOQ line(s) flagged red; 28 BOQ line(s) could not be priced.
0 failed · 0 unknown · 11 passed · 28 red and 0 amber BOQ lines · 150 pages read in 53s
OEM authorization (MAF) | PASS | Firm holds a valid Havells authorization | 86 | "The bidder shall furnish Manufacturer's Authorization Form (MAF) from the OEM (Havells / Legrand / Schneider) for all switchgear items offered, specific to this bid."
Lines priced: 0 of 28
1 | MCB 6A SP C-curve 10kA | HV-MCB-C06-1P | 1.00 | ₹240 | 38% | — | — | 🔴 Quantity or unit could not be extracted reliably; not priced
```

**Tender B, verdict:**
```
NO-GO. Past experience: needs 7 years, firm has 6 (p. 2); Certificate: ISO 14001 expired on 2026-05-31 (p. 2);
OEM authorization (MAF): Needs authorization from L&T; firm holds Havells, Polycab (p. 24);
Approved makes: No approved make held for: LT panel (L&T) (p. 24).
4 failed · 1 unknown · 2 passed · 1 red and 7 amber BOQ lines · 64 pages read in 38s
Cost total ₹5,97,253 · Bid total ₹6,86,854.20 · Margin 13.05% · Lines priced 13 of 14
```

**Bad inputs** (screenshot: [test3-bad-inputs-blocked.jpg](test-report/test3-bad-inputs-blocked.jpg)):
```
{ "analyzeDisabled": true, "apiCallsAfterClick": 0,
  "messages": ["✗ This PDF has no readable text; it looks scanned. GoBid only reads text PDFs for now.",
               "✗ bad-price-list.csv: missing column \"discount_pct\" (found: sku, description, brand, unit, list_price)"] }
```

**Tender A quantity diagnosis:** pdf.js text for p. 140 reads `1 | Supply, installation, testing and commissioning of MCB 6A SP C-curve 10kA | Nos | 120`. Sending only p. 140–145 to the same BOQ step returned all 28 rows *with* quantities (120, 180, 60, 24, 12…). So the PDF reading is fine. The quantities disappear only in the full 150-page run, which points at the AI step on long inputs (page selection or the free *lite* model), not at the pricing code.

## What would embarrass you in front of a judge

1. **The 150-page tender prices nothing.** "Lines priced 0 of 28" with 28 red flags is the headline screen on the exact case the pitch is about.
2. **A wrong FAIL in the NO-GO headline.** "Past experience: needs 7 years" is false. The verdict is right for other reasons, but a judge who reads the quote will see the AI misread it, which undercuts "AI reads, rules decide".
3. **The screen contradicts itself on EMD (Tender A).** One row says "Arrange EMD of ₹97,200" while the MSE row right below says "EMD: yes" (exempt). The code reads only the first MSE-exemption row it finds.
4. **"Could not be read" next to the readable answer.** Tender B's EMD says "EMD amount could not be read" beside the quote "Earnest Money: Rs. 62,800…".
5. **False amber flags.** In Tender B, 7 Havells lines say "Havells is not in the tender's approved makes (L&T, Polycab, KEI)". That list only covers the panel and cables, but it's applied to every line.
6. **The margin is always 13.05%.** It's just the 15% markup restated, the same on every tender, so a judge will ask what it measures.
7. **An "exact quote" with "…" in it.** Tender B's approved-makes quote joins two sentences with "...". It passed the fuzzy quote check, but it isn't literally exact.
8. **The same blocker counted twice.** L&T appears as both an OEM fail and an approved-makes fail.
9. **Free Gemini limits.** 5 requests a minute and a small daily cap: two judges clicking in the same minute, or a busy demo day, gives "allowance used up". If the Vercel link is public, anyone can use up your quota.
10. **Results can change between runs.** The same tender may give slightly different extractions each time. Show a run you've already checked, not a live first attempt.
11. **n8n isn't connected.** The brief says n8n orchestrates. The workflow file exists and is simulated in tests, but the app currently runs in direct mode.
12. **The 50 kA MCCB came back "no match" rather than a red "36 kA is too low" flag.** That's safe, but less impressive than the planned demo moment.
