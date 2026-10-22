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

// ---------- GeM collector: every hour, search GeM's public bid list and save to Supabase ----------
// Replace YOUR-PROJECT in the "Supabase: save bids" node with your Supabase project URL.
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const gemGap = Number(code("gem.js").match(/GEM_REQUEST_GAP_MS = (\d+)/)[1]);

const collector = [
  add({
    name: "Every hour",
    type: "n8n-nodes-base.scheduleTrigger",
    typeVersion: 1.2,
    parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } },
  }),
  add({
    name: "GeM: open All Bids page",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: "GET",
      url: "https://bidplus.gem.gov.in/all-bids",
      sendHeaders: true,
      specifyHeaders: "json",
      jsonHeaders: JSON.stringify({ "user-agent": code("gem.js").match(/GEM_USER_AGENT = "([^"]+)"/)[1] }),
      options: { response: { response: { fullResponse: true, responseFormat: "text" } } },
    },
  }),
  codeNode(
    "Plan searches",
    `${code("gem.js")}\n\nconst page = $input.first().json;\n` +
      "const session = readGemSession(page.body !== undefined ? page.body : page.data, page.headers['set-cookie']);\n" +
      "return buildGemSearches(session).map((s) => ({ json: s }));",
  ),
  add({
    name: "GeM: search bids",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: "POST",
      url: "={{ $json.url }}",
      sendHeaders: true,
      specifyHeaders: "json",
      jsonHeaders: "={{ JSON.stringify($json.headers) }}",
      sendBody: true,
      contentType: "raw",
      rawContentType: "application/x-www-form-urlencoded",
      body: "={{ $json.body }}",
      // One request at a time, spaced out, to stay light on GeM.
      options: { batching: { batch: { batchSize: 1, batchInterval: gemGap } }, response: { response: { responseFormat: "json" } } },
    },
  }),
  codeNode(
    "Merge bids",
    `${code("gem.js")}\n\nconst plans = $('Plan searches').all();\n` +
      "const lists = $input.all().map((reply, i) => parseGemSearch(reply.json, plans[i].json.keyword));\n" +
      "return [{ json: { rows: toTenderRows(mergeGemBids(lists), new Date().toISOString()), requests: plans.length + 1 } }];",
  ),
  add({
    name: "Supabase: save bids",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: "POST",
      url: `${SUPABASE_URL}/rest/v1/rpc/upsert_gem_tenders`,
      authentication: "predefinedCredentialType",
      nodeCredentialType: "supabaseApi",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json) }}",
      options: {},
    },
  }),
];
writeChain("GoBid GeM collector", "n8n/gobid-gem-collector.json", collector);
