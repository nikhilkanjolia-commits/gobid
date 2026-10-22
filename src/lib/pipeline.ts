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
export async function runDirect(pages: PageText[], priceRows: PriceRow[], apiKey: string) {
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

  return L.finalizeResult({ pages, clauses: eligibility.clauses, boqRows, matches, priceRows, firm, today: todayInIndia() });
}

// Demo mode: a made-up tender with pretend AI answers, through the real decision logic.
export function runDemo() {
  const L = loadLogic();
  const sample = (f: string) => parsePriceList(f, readFileSync(path.join(process.cwd(), "public", "samples", f), "utf8"));
  const priceRows = mergePriceLists([sample("switchgear-supplier.csv"), sample("cables-supplier.csv")]).rows;
  return L.finalizeResult({
    pages: demoPages,
    clauses: demoAnswers.clauses,
    boqRows: L.uniqueItems(demoAnswers.boqRows),
    matches: demoAnswers.matches,
    priceRows,
    firm,
    today: todayInIndia(),
  });
}
