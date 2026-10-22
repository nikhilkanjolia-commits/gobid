// Builds one user's daily GoBid email from their digest rows. Pure function: no sending.

export type DigestBid = {
  section: "new" | "closing_soon";
  bid_number: string;
  bid_kind: string | null;
  items: string;
  ministry: string | null;
  department: string | null;
  quantity: number | null;
  ends_at: string;
  document_url: string | null;
  matched_keywords: string[];
};

export type DigestEmail = { subject: string; html: string; text: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function ist(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function closesIn(iso: string, now: Date) {
  const hours = (new Date(iso).getTime() - now.getTime()) / 3_600_000;
  if (hours < 24) return `closes in ${Math.max(1, Math.round(hours))} h`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Returns null when there's nothing to send (no new or closing bids), so no empty emails go out.
export function buildDigestEmail(opts: {
  bids: DigestBid[];
  topics: string[];
  siteUrl: string;
  unsubscribeUrl: string;
  now?: Date;
}): DigestEmail | null {
  const now = opts.now ?? new Date();
  const fresh = opts.bids.filter((b) => b.section === "new");
  const freshIds = new Set(fresh.map((b) => b.bid_number));
  // A bid that's both new and closing soon is listed once, under "new".
  const closing = opts.bids.filter((b) => b.section === "closing_soon" && !freshIds.has(b.bid_number));
  if (fresh.length === 0 && closing.length === 0) return null;

  const topics = opts.topics.length ? opts.topics.join(", ") : "your categories";
  const subject =
    fresh.length > 0
      ? `${fresh.length} new GeM tender${fresh.length === 1 ? "" : "s"} for ${trim(topics, 60)}`
      : `${closing.length} GeM tender${closing.length === 1 ? "" : "s"} closing soon for ${trim(topics, 50)}`;

  const row = (b: DigestBid) => {
    const where = [b.ministry, b.department && b.department !== "NA" ? b.department : null].filter(Boolean).join(" › ");
    const link = b.document_url ? `<a href="${esc(b.document_url)}" style="color:#1d4ed8">View on GeM</a> · ` : "";
    const analyze = `${opts.siteUrl}/analyze?${new URLSearchParams({ bid: b.bid_number, ...(b.document_url ? { doc: b.document_url } : {}) })}`;
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb">
<div style="font:600 15px Arial,sans-serif;color:#111827">${esc(trim(b.items || "Items not listed", 140))}</div>
<div style="font:13px Arial,sans-serif;color:#4b5563;margin-top:2px">${esc(where || "Ministry not listed")}</div>
<div style="font:12px Arial,sans-serif;color:#6b7280;margin-top:4px">${esc(b.bid_number)} · ${b.bid_kind === "RA" ? "Reverse auction" : "Bid"}${b.quantity != null ? ` · Qty ${b.quantity}` : ""} · ends ${esc(ist(b.ends_at))} (<b>${esc(closesIn(b.ends_at, now))}</b>)</div>
<div style="font:13px Arial,sans-serif;margin-top:6px">${link}<a href="${esc(analyze)}" style="color:#1d4ed8">Analyze with GoBid</a></div>
</td></tr>`;
  };
  const section = (title: string, list: DigestBid[]) =>
    list.length ? `<h2 style="font:700 17px Arial,sans-serif;color:#111827;margin:24px 0 4px">${title} (${list.length})</h2><table width="100%" cellpadding="0" cellspacing="0">${list.map(row).join("")}</table>` : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f9fafb">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;background:#ffffff">
<div style="font:700 22px Arial,sans-serif;color:#1e40af">GoBid</div>
<p style="font:14px Arial,sans-serif;color:#374151">Your daily GeM update for <b>${esc(topics)}</b>.</p>
${section("New tenders", fresh)}
${section("Closing within 3 days", closing)}
<p style="font:14px Arial,sans-serif;margin-top:24px"><a href="${esc(opts.siteUrl)}" style="color:#1d4ed8">See all tenders</a> · <a href="${esc(opts.siteUrl)}/alerts" style="color:#1d4ed8">Change categories</a></p>
<p style="font:12px Arial,sans-serif;color:#9ca3af;margin-top:24px">You get this because you turned on GoBid email alerts. <a href="${esc(opts.unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a></p>
</div></body></html>`;

  const textRow = (b: DigestBid) =>
    `- ${trim(b.items || "Items not listed", 120)}\n  ${b.bid_number} · ends ${ist(b.ends_at)} (${closesIn(b.ends_at, now)})${b.document_url ? `\n  ${b.document_url}` : ""}`;
  const text = [
    `GoBid: your daily GeM update for ${topics}.`,
    fresh.length ? `\nNEW TENDERS (${fresh.length})\n${fresh.map(textRow).join("\n")}` : "",
    closing.length ? `\nCLOSING WITHIN 3 DAYS (${closing.length})\n${closing.map(textRow).join("\n")}` : "",
    `\nAll tenders: ${opts.siteUrl}\nChange categories: ${opts.siteUrl}/alerts\nUnsubscribe: ${opts.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}
