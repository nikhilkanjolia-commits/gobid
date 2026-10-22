import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

// The n8n Code-node scripts, in the order the n8n "Decide" node stacks them. The server runs
// the exact same text (direct mode and demo), so both paths make identical decisions.
const FILES = ["verifyQuotes.js", "rules.js", "shortlist.js", "matchChecks.js", "pricing.js", "verdict.js", "requests.js", "finalize.js"];
const EXPORTS = [
  "classifyRequest",
  "eligibilityRequest",
  "boqRequest",
  "matchRequest",
  "readGeminiJson",
  "toClauses",
  "uniqueItems",
  "shortlistSkus",
  "finalizeResult",
] as const;

// The scripts are untyped JavaScript; their results are checked with zod (schema.ts) instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => any;
export type Logic = Record<(typeof EXPORTS)[number], Fn>;

let cached: Logic | null = null;

export function loadLogic(): Logic {
  if (cached) return cached;
  const dir = path.join(process.cwd(), "n8n", "code");
  const src = FILES.map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n\n");
  cached = new Function(`${src}\nreturn { ${EXPORTS.join(", ")} };`)() as Logic;
  return cached;
}
