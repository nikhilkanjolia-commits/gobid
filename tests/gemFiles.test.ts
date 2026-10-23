import { describe, expect, it } from "vitest";
import { BID_NUMBER, gemFilesFrom, isReadableBidDocument } from "../src/lib/gemFiles";

// Links exactly as found in real GeM bid documents (October 2026).
const SPEC = "https://mkp.gem.gov.in/uploaded_documents/51/16/877/OrderItem/BoqDocument/2026/10/22/spec-2602001924___drawing_2026-10-22-15-53-55_5895d63ea2556f021b22b7a310af0a4a.pdf";
const BOQ = "https://mkp.gem.gov.in/uploaded_documents/51/16/877/OrderItem/BoqLineItemsDocument/2026/10/22/boq_item_sample_file_2026-10-22-15-53-55_90700932fd2b6322d8c0d1a7d3103c34.csv";
const ATC = "https://fulfilment.gem.gov.in/contract/slafds?fileDownloadPath=SLA_UPLOAD_PATH/2026/Oct/GEM_2026_B_8189096/CLM0010/ATCDOC_6d07a490-0fc5-485b-b894-17926.pdf";
const GTC = "https://admin.gem.gov.in/apis/v1/gtc/pdfByDate/?date=20261023";
const OM = "https://bidplus.gem.gov.in/bidding/downloadOmppdfile/";
const CAT = "https://bidplus.gem.gov.in/bidding/bid/showCatalogue/V-QFQhH7gVivK47Z9B-gMovGStHjXKRgMiF6rnuCQNc";

describe("gemFilesFrom", () => {
  it("lists each file once, labelled and ordered, with the pages it is linked on", () => {
    const files = gemFilesFrom([
      { url: OM, page: 5 },
      { url: SPEC, page: 6 },
      { url: BOQ, page: 6 },
      { url: SPEC, page: 7 },
      { url: BOQ, page: 7 },
      { url: ATC, page: 22 },
      { url: GTC, page: 23 },
    ]);
    expect(files.map((f) => f.kind)).toEqual(["spec", "boq_items", "atc", "om", "gtc"]);
    expect(files[0]).toMatchObject({ label: "Specification / BOQ document", fileName: "spec-2602001924___drawing.pdf", pages: [6, 7] });
    expect(files[1].fileName).toBe("boq_item_sample_file.csv");
    expect(files[2]).toMatchObject({ kind: "atc", fileName: "ATCDOC_6d07a490-0fc5-485b-b894-17926.pdf" });
    expect(files[4].fileName).toBeNull();
  });

  it("keeps the GeM category specification page", () => {
    expect(gemFilesFrom([{ url: CAT, page: 3 }])[0].kind).toBe("catalogue");
  });

  it("ignores links that are not https gem.gov.in files", () => {
    const files = gemFilesFrom([
      { url: "http://mkp.gem.gov.in/uploaded_documents/x.pdf", page: 1 },
      { url: "https://evil.example.com/gem.gov.in/BoqDocument/x.pdf", page: 1 },
      { url: "https://gem.gov.in.evil.com/BoqDocument/x.pdf", page: 1 },
      { url: "javascript:alert(1)", page: 1 },
      { url: "https://gem.gov.in/", page: 1 },
    ]);
    expect(files).toEqual([]);
  });
});

describe("isReadableBidDocument", () => {
  it("accepts only GeM's own bid document links", () => {
    expect(isReadableBidDocument("https://bidplus.gem.gov.in/showbidDocument/10067820")).toBe(true);
    expect(isReadableBidDocument("https://bidplus.gem.gov.in/showradocumentPdf/10070635")).toBe(true);
    expect(isReadableBidDocument("https://bidplus.gem.gov.in/list-ra-schedules/123")).toBe(false);
    expect(isReadableBidDocument("https://bidplus.gem.gov.in/resources/upload_nas/x.pdf")).toBe(false);
    expect(isReadableBidDocument("https://bidplus.gem.gov.in.evil.com/showbidDocument/1")).toBe(false);
    expect(isReadableBidDocument(null)).toBe(false);
  });
});

describe("BID_NUMBER", () => {
  it("matches GeM bid numbers only", () => {
    expect(BID_NUMBER.test("GEM/2026/B/8189096")).toBe(true);
    expect(BID_NUMBER.test("GEM/2026/R/757391")).toBe(true);
    expect(BID_NUMBER.test("GEM/2026/B/1; drop table")).toBe(false);
  });
});
