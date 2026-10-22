import { AnalyzeRequest, AnalyzeResult } from "@/lib/schema";
import { firm, runDemo, runDirect, todayInIndia } from "@/lib/pipeline";

// A 150-page tender takes about 2 minutes; allow up to 5.
export const maxDuration = 300;

const KEY_PLACEHOLDER = "paste-your-gemini-key-here";
const N8N_TIMEOUT_MS = 240_000;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

async function viaN8n(body: unknown) {
  const res = await fetch(process.env.N8N_WEBHOOK_URL!, {
    method: "POST",
    headers: { "content-type": "application/json", "x-gobid-secret": process.env.N8N_SHARED_SECRET ?? "" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    throw new Error(data?.error ?? data?.message ?? `n8n answered ${res.status}`);
  }
  return data;
}

export async function POST(req: Request) {
  const started = Date.now();
  const parsed = AnalyzeRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "The upload was incomplete: a tender PDF and at least one valid price list are needed.");

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  let mode: "demo" | "n8n" | "direct";
  let raw: unknown;
  try {
    if ("demo" in parsed.data) {
      mode = "demo";
      raw = runDemo();
    } else if (process.env.N8N_WEBHOOK_URL) {
      mode = "n8n";
      raw = await viaN8n({ ...parsed.data, firm, today: todayInIndia() });
    } else if (apiKey && apiKey !== KEY_PLACEHOLDER) {
      mode = "direct";
      raw = await runDirect(parsed.data.pages, parsed.data.priceRows, apiKey);
    } else {
      return fail(503, "No AI connected yet. Paste your Gemini key into .env.local (GEMINI_API_KEY=…) and restart the app.");
    }
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "it took longer than 4 minutes" : (e as Error).message;
    return fail(502, `Analysis failed: ${reason}. Nothing was decided. Try again.`);
  }

  const result = AnalyzeResult.safeParse(raw);
  if (!result.success) {
    return fail(502, "Analysis failed: the reply was incomplete or malformed. Nothing was decided. Try again.");
  }
  return Response.json({ ...result.data, meta: { ...result.data.meta, mode, seconds: Math.round((Date.now() - started) / 1000) } });
}
