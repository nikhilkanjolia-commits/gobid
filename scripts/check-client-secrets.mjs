// Checks the built browser JavaScript (.next/static) contains no secrets. Run after `npm run build`:
//   npm run check:secrets
// It looks for the actual secret values from .env.local and for server-only setting names.
// Prints only names and counts, never the values.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SECRET_NAMES = ["GEMINI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEM_COLLECT_SECRET", "ADMIN_PASSCODE", "BREVO_API_KEY", "N8N_SHARED_SECRET"];

const env = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

if (!existsSync(".next/static")) {
  console.error("No .next/static folder: run `npm run build` first.");
  process.exit(2);
}
const bundle = files(".next/static").filter((f) => /\.(js|json|html|css|map)$/.test(f));
let problems = 0;
for (const name of SECRET_NAMES) {
  const value = env[name];
  const placeholder = !value || value.startsWith("paste-");
  const valueHits = placeholder ? [] : bundle.filter((f) => readFileSync(f, "utf8").includes(value));
  const nameHits = bundle.filter((f) => readFileSync(f, "utf8").includes(name));
  const status = valueHits.length || nameHits.length ? "FOUND IN BROWSER CODE" : "ok";
  if (status !== "ok") problems++;
  console.log(`${name.padEnd(26)} value ${placeholder ? "(not set)" : valueHits.length ? `in ${valueHits.length} file(s)` : "not found"} · name ${nameHits.length ? `in ${nameHits.length} file(s)` : "not found"} → ${status}`);
}
console.log(`\nScanned ${bundle.length} browser files. ${problems ? `${problems} problem(s).` : "No secrets found."}`);
process.exit(problems ? 1 : 0);
