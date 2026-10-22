import { describe, expect, it } from "vitest";
import firm from "../data/firm-profile.json";
import demoAnswers from "../data/demo/ai-answers.json";
import demoPages from "../data/demo/tender-pages.json";
import workflow from "../n8n/gobid-workflow.json";
import { readFileSync } from "node:fs";
import { mergePriceLists, parsePriceList } from "../src/lib/priceList";

// Runs the workflow's Code nodes in order, the way n8n does, with Gemini replaced by the
// demo's pretend answers. Checks the generated n8n file really works end to end.
const geminiReply = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

const priceRows = mergePriceLists(
  ["switchgear-supplier.csv", "cables-supplier.csv"].map((f) => parsePriceList(f, readFileSync(`public/samples/${f}`, "utf8"))),
).rows;

const body = { pages: demoPages, priceRows, firm, today: "2026-10-22" };
const fakeAi: Record<string, unknown> = {
  "Gemini: classify pages": geminiReply({ pages: demoPages.map((p) => ({ page: p.page, labels: p.page >= 5 ? ["boq"] : ["eligibility"] })) }),
  "Gemini: eligibility": geminiReply({ clauses: demoAnswers.clauses, documents: demoAnswers.documents }),
  "Gemini: BOQ": geminiReply({ rows: demoAnswers.boqRows }),
  "Gemini: match SKUs": geminiReply({ matches: demoAnswers.matches }),
  "Gemini: supporting docs": geminiReply({ documents: [] }),
};

function run() {
  const outputs: Record<string, unknown> = { Webhook: { body } };
  const $ = (name: string) => ({ first: () => ({ json: outputs[name] }) });
  const sent: Record<string, { model: string; body: unknown }> = {};
  for (const node of workflow.nodes) {
    if (node.type === "n8n-nodes-base.code") {
      const items = new Function("$", (node.parameters as { jsCode: string }).jsCode)($) as { json: unknown }[];
      outputs[node.name] = items[0].json;
    } else if (node.type === "n8n-nodes-base.httpRequest") {
      const prev = workflow.nodes[workflow.nodes.indexOf(node) - 1].name;
      sent[node.name] = outputs[prev] as { model: string; body: unknown };
      outputs[node.name] = fakeAi[node.name];
    }
  }
  return {
    result: outputs["Decide"] as {
      verdict: { decision: string; reason: string };
      boq: { totals: { redLines: number } };
      readiness: { summary: { status: string }; documents: { status: string }[] };
    },
    sent,
  };
}

describe("n8n workflow", () => {
  it("sends Gemini a model and a JSON-schema request at every AI step", () => {
    const { sent } = run();
    expect(Object.keys(sent)).toEqual(Object.keys(fakeAi));
    for (const req of Object.values(sent)) {
      expect(req.model).toBe("gemini-3-flash-preview");
      expect(JSON.stringify(req.body)).toContain("responseSchema");
    }
  });

  it("reaches the demo tender's NO-GO with the reason and flags", () => {
    const { result } = run();
    expect(result.verdict.decision).toBe("NO-GO");
    expect(result.verdict.reason).toContain("Schneider");
    expect(result.boq.totals.redLines).toBeGreaterThanOrEqual(2);
    expect(result.readiness.summary.status).toBe("Potential disqualification");
    expect(result.readiness.documents).toHaveLength(6);
  });

  it("is wired in a single chain ending at the webhook reply", () => {
    const names = workflow.nodes.map((n) => n.name);
    expect(names[0]).toBe("Webhook");
    expect(names.at(-1)).toBe("Respond");
    expect(Object.keys(workflow.connections)).toHaveLength(names.length - 1);
  });
});
