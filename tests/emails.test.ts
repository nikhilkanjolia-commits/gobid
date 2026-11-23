import { describe, expect, it } from "vitest";
import { buildContactAutoReply, buildContactNotification, buildWelcomeEmail } from "../src/lib/emails";

const SITE = "https://gobid-lake.vercel.app";
const msg = { id: 42, name: "Ravi Sharma", email: "ravi@example.in", company: "Sharma Electricals", message: "Can GoBid read CPWD tenders?\nWe bid weekly." };

describe("buildWelcomeEmail", () => {
  it("links to alerts and contact, in HTML and plain text", () => {
    const e = buildWelcomeEmail({ siteUrl: SITE });
    expect(e.subject).toBe("Welcome to GoBid");
    expect(e.html).toContain(`${SITE}/alerts`);
    expect(e.html).toContain(`${SITE}/contact`);
    expect(e.text).toContain(`${SITE}/alerts`);
  });
});

describe("buildContactAutoReply", () => {
  it("greets by first name, quotes the message and gives the reference", () => {
    const e = buildContactAutoReply(msg, { siteUrl: SITE });
    expect(e.html).toContain("Hi Ravi,");
    expect(e.html).toContain("Can GoBid read CPWD tenders?<br>We bid weekly.");
    expect(e.text).toContain("> We bid weekly.");
    expect(e.text).toContain("#42");
  });

  it("escapes anything that looks like HTML", () => {
    const e = buildContactAutoReply({ ...msg, name: "<script>x</script>", message: `<img src=x onerror="alert(1)"> hello there` }, { siteUrl: SITE });
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<img");
    expect(e.html).toContain("&lt;img");
  });
});

describe("buildContactNotification", () => {
  it("shows who wrote, their company and the message", () => {
    const e = buildContactNotification(msg);
    expect(e.subject).toBe("New GoBid contact #42: Ravi Sharma");
    expect(e.html).toContain("ravi@example.in");
    expect(e.text).toContain("Sharma Electricals");
  });
});
