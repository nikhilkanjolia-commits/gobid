import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import firm from "../../data/firm-profile.json";
import demoAnswers from "../../data/demo/ai-answers.json";
import demoPages from "../../data/demo/tender-pages.json";
import { callGemini } from "./gemini";
import { loadLogic } from "./logic";
import type { PageText } from "./pdfText";
import { mergePriceLists, parsePriceList, type PriceRow } from "./priceList";

export { firm };

export function todayInIndia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// Direct mode: the same steps as the n8n workflow, run here with the key from .env.local.
// Used when N8N_WEBHOOK_URL isn't set, so the app works before n8n is connected.
export type SupportingFile = { name: string; pages: PageText[]; unreadable: boolean; error: string | null };

export async function runDirect(pages: PageText[], priceRows: PriceRow[], apiKey: string, supportingFiles: SupportingFile[] = []) {
  const L = loadLogic();
  // One retry if the AI's answer isn't readable JSON (it occasionally isn't).
  const ask = async (req: unknown, step: string) => {
    try {
      return L.readGeminiJson(await callGemini(req as never, apiKey, step), step);
    } catch (e) {
      if ((e as Error).message.includes("Gemini error")) throw e;
      return L.readGeminiJson(await callGemini(req as never, apiKey, step), step);
    }
  };

  const classified = await ask(L.classifyRequest(pages), "Classifying pages");
  const [eligibility, boq] = await Promise.all([
    ask(L.eligibilityRequest(pages, classified), "Reading eligibility clauses"),
    ask(L.boqRequest(pages, classified), "Reading the BOQ"),
  ]);
  const boqRows = L.uniqueItems(boq.rows);
  const shortlist = L.shortlistSkus(boqRows, priceRows);
  const match = L.matchRequest(boqRows, shortlist);
  const matches = match.lineCount > 0 ? (await ask(match.request, "Matching SKUs")).matches : [];

  // Supporting documents: only readable ones go to the AI; unreadable ones are reported as such.
  const readable = supportingFiles.filter((f) => !f.unreadable);
  let supportingAi: unknown[] = [];
  if (readable.length) {
    const answer = await ask(L.supportingDocsRequest(readable), "Reading supporting documents");
    // Map the AI's numbering (readable files only) back to the full upload list.
    const indexInAll = readable.map((f) => supportingFiles.indexOf(f) + 1);
    supportingAi = L.toSupportingDocs(answer, readable.length).map((d: { docIndex: number }) => ({ ...d, docIndex: indexInAll[d.docIndex - 1] }));
  }

  return L.finalizeResult({
    pages,
    clauses: L.toClauses(eligibility),
    docRequirements: L.toDocRequirements(eligibility),
    boqRows,
    matches,
    priceRows,
    firm,
    today: todayInIndia(),
    supportingFiles,
    supportingAi,
  });
}

// Demo mode: a made-up tender with pretend AI answers, through the real decision logic.
export function runDemo() {
  const L = loadLogic();
  const sample = (f: string) => parsePriceList(f, readFileSync(path.join(process.cwd(), "public", "samples", f), "utf8"));
  const priceRows = mergePriceLists([sample("switchgear-supplier.csv"), sample("cables-supplier.csv")]).rows;
  return L.finalizeResult({
    pages: demoPages,
    clauses: demoAnswers.clauses,
    docRequirements: L.toDocRequirements(demoAnswers),
    boqRows: L.uniqueItems(demoAnswers.boqRows),
    matches: demoAnswers.matches,
    priceRows,
    firm,
    today: todayInIndia(),
  });
}
