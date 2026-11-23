import { assistantModels, buildAssistantRequest, ChatRequest, readAssistantReply, recentTurns } from "@/lib/assistant";
import { callGemini } from "@/lib/gemini";

// POST /api/assistant {messages:[{role:"user"|"assistant", text}]} → {reply}
// The help chat on every page. Uses the same GEMINI_API_KEY as the analyser. Nothing is saved.
export const maxDuration = 60;

const KEY_PLACEHOLDER = "paste-your-gemini-key-here";
const FALLBACK = "The assistant isn't available right now. You can send your question through the contact form at /contact and the team will reply by email.";

// A simple per-visitor limit so the free Gemini allowance isn't used up by one person.
// It lives in the server's memory, so it's best-effort (each server copy counts separately).
const WINDOW_MS = 10 * 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

function allowed(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

export async function POST(req: Request) {
  const parsed = ChatRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please type a question (up to 1,000 characters)." }, { status: 400 });
  if (!recentTurns(parsed.data.messages).length) return Response.json({ error: "Please type a question." }, { status: 400 });
  if (!allowed(req)) {
    return Response.json({ error: "You've asked a lot of questions in a short time. Please wait a few minutes, or use the contact form at /contact." }, { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === KEY_PLACEHOLDER) return Response.json({ error: FALLBACK }, { status: 503 });

  for (const model of assistantModels(process.env.GEMINI_MODEL)) {
    try {
      const raw = await callGemini(buildAssistantRequest(parsed.data.messages, model), apiKey, `Assistant (${model})`, { tries: 1, exactModel: true, timeoutMs: 12_000 });
      const reply = readAssistantReply(raw);
      if (!reply) return Response.json({ error: "I couldn't answer that one. Try rephrasing, or ask the team at /contact." }, { status: 502 });
      return Response.json({ reply });
    } catch (e) {
      console.error("assistant failed:", (e as Error).message.slice(0, 200));
    }
  }
  return Response.json({ error: FALLBACK }, { status: 502 });
}
