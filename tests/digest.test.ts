import { describe, expect, it } from "vitest";
import digestWorkflow from "../n8n/gobid-daily-digest.json";
import { buildDigestEmail, type DigestBid } from "../src/lib/digest";

const NOW = new Date("2026-10-22T02:30:00Z"); // 8:00 AM India time
const bid = (n: number, section: DigestBid["section"], hoursLeft: number, extra: Partial<DigestBid> = {}): DigestBid => ({
  section,
  bid_number: `GEM/2026/B/${n}`,
  bid_kind: "BID",
  items: `Item ${n}`,
  ministry: "Ministry of Defence",
  department: "NA",
  quantity: 5,
  ends_at: new Date(NOW.getTime() + hoursLeft * 3_600_000).toISOString(),
  document_url: `https://bidplus.gem.gov.in/showbidDocument/${n}`,
  matched_keywords: ["MCB"],
  ...extra,
});
const opts = { topics: ["Switchgear"], siteUrl: "https://gobid-lake.vercel.app", unsubscribeUrl: "https://gobid-lake.vercel.app/api/alerts/unsubscribe?token=abc", now: NOW };

describe("buildDigestEmail", () => {
  it("sends nothing when there are no new or closing bids", () => {
    expect(buildDigestEmail({ ...opts, bids: [] })).toBeNull();
  });

  it("lists new bids and closing-soon bids, each bid once", () => {
    const email = buildDigestEmail({ ...opts, bids: [bid(1, "new", 100), bid(2, "new", 10), bid(2, "closing_soon", 10), bid(3, "closing_soon", 50)] })!;
    expect(email.subject).toBe("2 new GeM tenders for Switchgear");
    expect(email.html).toContain("New tenders (2)");
    expect(email.html).toContain("Closing within 3 days (1)");
    expect(email.html.match(/GEM\/2026\/B\/2 /g)).toHaveLength(1);
    expect(email.html).toContain("closes in 10 h");
    expect(email.html).toContain("2 days left");
    expect(email.html).toContain("ends 22 Oct, 06:00 pm");
    expect(email.text).toContain("NEW TENDERS (2)");
  });

  it("names closing-soon tenders in the subject when nothing is new", () => {
    expect(buildDigestEmail({ ...opts, bids: [bid(7, "closing_soon", 30)] })!.subject).toBe("1 GeM tender closing soon for Switchgear");
  });

  it("always includes the unsubscribe and settings links, and an Analyze link per bid", () => {
    const email = buildDigestEmail({ ...opts, bids: [bid(1, "new", 100)] })!;
    expect(email.html).toContain('href="https://gobid-lake.vercel.app/api/alerts/unsubscribe?token=abc"');
    expect(email.html).toContain("https://gobid-lake.vercel.app/alerts");
    expect(email.html).toContain("/analyze?bid=GEM%2F2026%2FB%2F1&amp;doc=");
    expect(email.text).toContain("Unsubscribe: https://gobid-lake.vercel.app/api/alerts/unsubscribe?token=abc");
  });

  it("escapes item text so a tender can't inject HTML", () => {
    const email = buildDigestEmail({ ...opts, bids: [bid(1, "new", 100, { items: '<script>alert(1)</script> & "MCB"' })] })!;
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;MCB&quot;");
  });
});

describe("daily digest workflow (n8n)", () => {
  it("runs at 8 AM India time and calls the site's digest route with the header secret", () => {
    expect(digestWorkflow.settings.timezone).toBe("Asia/Kolkata");
    expect(JSON.stringify(digestWorkflow.nodes[0].parameters)).toContain('"triggerAtHour":8');
    const call = digestWorkflow.nodes[1].parameters as Record<string, unknown>;
    expect(call.url).toMatch(/\/api\/digest\/send$/);
    expect(call.genericAuthType).toBe("httpHeaderAuth");
  });
});
