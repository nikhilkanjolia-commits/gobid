// Builds the n8n workflows from the scripts in n8n/code, so the Code nodes in n8n run exactly
// the tested code. Run: npm run build:n8n, then import the files in n8n
// (Workflows → Import from file). No secrets go in these files.
//   n8n/gobid-workflow.json       analyze one tender (webhook from the site)
//   n8n/gobid-gem-collector.json  collect GeM bids every hour into Supabase
import { readFileSync, writeFileSync } from "node:fs";

const code = (...files) => files.map((f) => readFileSync(`n8n/code/${f}`, "utf8")).join("\n\n");
const BODY = "const body = $('Webhook').first().json.body;";

let x = 0;
let nodes = [];
function add(node) {
  nodes.push({ id: crypto.randomUUID(), position: [x, 0], ...node });
  x += 220;
  return node.name;
}

function codeNode(name, jsCode) {
  return add({ name, type: "n8n-nodes-base.code", typeVersion: 2, parameters: { jsCode } });
}

// Calls Gemini with the {model, body} the previous Code node built. Uses the n8n
// "Google Gemini(PaLM) Api" credential, so the API key stays inside n8n.
function geminiNode(name) {
  return add({
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: "POST",
      url: "=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.model }}:generateContent",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "googlePalmApi",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.body) }}",
      options: { timeout: 150000 },
    },
  });
}

const chain = [
  add({
    name: "Webhook",
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    parameters: { httpMethod: "POST", path: "gobid-analyze", authentication: "headerAuth", responseMode: "responseNode", options: {} },
  }),
  codeNode("A1 request", `${code("requests.js")}\n\n${BODY}\nreturn [{ json: classifyRequest(body.pages) }];`),
  geminiNode("Gemini: classify pages"),
  codeNode(
    "A2 request",
    `${code("requests.js")}\n\n${BODY}\nconst classified = readGeminiJson($('Gemini: classify pages').first().json, 'Classifying pages');\nreturn [{ json: eligibilityRequest(body.pages, classified) }];`,
  ),
  geminiNode("Gemini: eligibility"),
  codeNode(
    "A3 request",
    `${code("requests.js")}\n\n${BODY}\nconst classified = readGeminiJson($('Gemini: classify pages').first().json, 'Classifying pages');\nreturn [{ json: boqRequest(body.pages, classified) }];`,
  ),
  geminiNode("Gemini: BOQ"),
  codeNode(
    "A4 request",
    `${code("requests.js", "shortlist.js", "finalize.js")}\n\n${BODY}\nconst boqRows = uniqueItems(readGeminiJson($('Gemini: BOQ').first().json, 'Reading the BOQ').rows);\nconst m = matchRequest(boqRows, shortlistSkus(boqRows, body.priceRows));\nreturn [{ json: Object.assign({}, m.request, { boqRows: boqRows }) }];`,
  ),
  geminiNode("Gemini: match SKUs"),
  codeNode(
    "Decide",
    `${code("verifyQuotes.js", "rules.js", "matchChecks.js", "pricing.js", "verdict.js", "requests.js", "finalize.js")}\n\n${BODY}\n` +
      "const clauses = toClauses(readGeminiJson($('Gemini: eligibility').first().json, 'Reading eligibility clauses'));\n" +
      "const boqRows = $('A4 request').first().json.boqRows;\n" +
      "const matches = readGeminiJson($('Gemini: match SKUs').first().json, 'Matching SKUs').matches;\n" +
      "return [{ json: finalizeResult({ pages: body.pages, clauses, boqRows, matches, priceRows: body.priceRows, firm: body.firm, today: body.today }) }];",
  ),
  add({ name: "Respond", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, parameters: { respondWith: "firstIncomingItem", options: {} } }),
];

// Links the nodes one after another and writes the workflow file.
function writeChain(name, file, chain) {
  const connections = {};
  for (let i = 0; i < chain.length - 1; i++) {
    connections[chain[i]] = { main: [[{ node: chain[i + 1], type: "main", index: 0 }]] };
  }
  writeFileSync(file, JSON.stringify({ name, nodes, connections, settings: { executionOrder: "v1" } }, null, 2) + "\n");
  console.log(`Wrote ${file} (${nodes.length} nodes)`);
  nodes = [];
  x = 0;
}

writeChain("GoBid analyze", "n8n/gobid-workflow.json", chain);

// ---------- GeM collector: every hour, ask the site to collect GeM bids into Supabase ----------
// GeM refuses connections from servers outside India, which includes n8n Cloud, so the GeM
// requests run in the site's /api/gem/collect route (Vercel, Mumbai region) and n8n only
// triggers it. Replace YOUR-SITE with your Vercel production address, and give the node a
// "Header Auth" credential: name x-gobid-secret, value = GEM_COLLECT_SECRET.
const SITE_URL = "https://YOUR-SITE.vercel.app";

const collector = [
  add({
    name: "Every hour",
    type: "n8n-nodes-base.scheduleTrigger",
    typeVersion: 1.2,
    parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } },
  }),
  add({
    name: "GoBid: collect GeM bids",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    parameters: {
      method: "POST",
      url: `${SITE_URL}/api/gem/collect`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      // A collection takes about 80 s.
      options: { timeout: 280000 },
    },
  }),
];
writeChain("GoBid GeM collector", "n8n/gobid-gem-collector.json", collector);
