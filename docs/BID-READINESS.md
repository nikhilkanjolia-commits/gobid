# Bid Readiness

Part of the tender report on **Analyze a tender**. It answers: *what documents, technical checks and actions remain before this bid is ready for a human to approve?*

**AI reads, rules decide, the human approves.**

## How it works
| Step | Who | What |
|---|---|---|
| Find document requirements | AI (Gemini, same eligibility call) | Each document the tender asks for: type, name, required or conditional, page, exact quote |
| Read supporting documents | AI (one extra call, only when files are uploaded) | MAF letters, certificates, POs: issuer, holder, manufacturer, products, tender reference, territory, dates, signatory, standard, number, each with a quote |
| Check every quote | Code | A tender quote must be on its cited page; a document field counts only if its quote is in that document and contains the value (dates are matched in any common format) |
| Document checklist | Code (`n8n/code/readiness.js` → `evaluateDocuments`) | Verified / Missing / Needs review / Expired / Not applicable, with reason and next action |
| OEM authorization check | Code (`checkOemAuthorization`) | Field by field: manufacturer, authorized bidder, products, tender reference, territory, issue date, validity, signatory → match / conflict / missing / review |
| Technical compliance matrix | Code (`technicalCompliance`) | Per BOQ line: make, current, poles, kA, cores, sq mm, kV from the tender line vs the matched catalogue entry. A mismatch fails the line; a value missing from the catalogue needs review; a higher kA is accepted |
| Overall status | Code (`computeReadiness`) | Any eligibility fail, required document Missing/Expired, OEM conflict/missing, or non-compliant line → **Potential disqualification**; else anything unknown or needing review → **Review required**; else **Ready for human review** |

**What the code never does:**
- It never treats unknown as a pass.
- It never treats a similar product as a compliant one.
- It never accepts a file just because it exists: holder name, dates and scope are checked.
- It never creates or "approves" an authorization.

## Files
- **Rules:** `n8n/code/readiness.js`. AI requests and output clean-up are in `n8n/code/requests.js` (`DOC_TYPES`, `supportingDocsRequest`, `toDocRequirements`, `toSupportingDocs`). The assembly is in `n8n/code/finalize.js`.
- **Server:** `src/lib/pipeline.ts` (direct mode), `src/lib/schema.ts` (checks the whole result before it's shown), `src/app/api/analyze/route.ts`.
- **UI:** `src/components/BidReadiness.tsx`; the upload is in `src/components/Analyzer.tsx`. Excel adds the **Bid readiness** and **Technical compliance** sheets (`src/lib/exportXlsx.ts`).
- **n8n:** `n8n/gobid-workflow.json` gains **A6 request → Gemini: supporting docs**, and **Decide** runs the readiness rules. Regenerate it with `npm run build:n8n`. The site uses n8n only if `N8N_WEBHOOK_URL` is set; otherwise it calls Gemini directly.
- **Tests:** `tests/readiness.test.ts` (Tests A–D), `tests/inputs.test.ts` (bad input), `npm run check:secrets` (no secrets in browser code).

## Try it
- **Demo:** Analyze a tender → **Try the demo tender**. You get Potential disqualification: the Schneider MAF is missing (p. 3), and a 25 kA MCCB is matched to a 36 kA line.
- **Real run:**
  - **Tender:** `public/test-tenders/tender-B-cpwd-polytechnic-64p.pdf`
  - **Supporting documents:** `support-B-maf-lnt.pdf` and `support-B-iso14001-expired.pdf`
  - **Result:** the ISO 14001 shows Expired, and the L&T letter's fields match the tender except its future issue date (Needs review).

## Limits
- **Text PDFs only.** Scanned documents are listed as not analysed (no OCR).
- **Parameters:** current, poles, kA, cores, sq mm and kV are compared by rule. Standards (IS/IEC), frequency and accessories are shown in the tender text but not compared yet.
- **Turnover and experience proof:** an uploaded CA certificate or PO is checked for holder and dates, but its amounts aren't compared with the requirement.
- **Firm profile:** the profile (`data/firm-profile.json`) can only make a document "Needs review" (you say you hold it), never "Verified" without an uploaded copy.
