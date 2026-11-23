import "server-only";

type GeminiRequest = { model: string; body: unknown };

const DEFAULT_TRIES = 4;
// Longer waits mean the free daily allowance is used up; fail fast with a clear message.
const DEFAULT_MAX_WAIT_MS = 60_000;

// How long Gemini asks us to wait ("retryDelay": "6s"), or a growing default.
function waitMs(detail: string, attempt: number) {
  const asked = detail.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1];
  return asked ? (Number(asked) + 1) * 1000 : attempt * 5000;
}

// Calls Gemini, retrying when it's busy (503) or rate-limited (429). The free tier allows
// 5 requests a minute and one analysis makes 4, so a short wait is normal.
// GEMINI_MODEL in .env.local overrides the model (each model has its own free allowance).
// opts lets a quick caller (the chat assistant) give up sooner instead of waiting up to a minute.
export async function callGemini(
  req: GeminiRequest,
  apiKey: string,
  step: string,
  opts: { tries?: number; maxWaitMs?: number; exactModel?: boolean; timeoutMs?: number } = {},
): Promise<unknown> {
  const model = (!opts.exactModel && process.env.GEMINI_MODEL?.trim()) || req.model;
  const TRIES = opts.tries ?? DEFAULT_TRIES;
  const MAX_WAIT_MS = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(req.body),
      ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
    if (res.ok) return res.json();
    const detail = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === TRIES) {
      const message = detail.match(/"message":\s*"([^"]+)"/)?.[1] ?? res.statusText;
      throw new Error(`${step}: Gemini error ${res.status} (${message.slice(0, 160)})`);
    }
    const wait = waitMs(detail, attempt);
    if (wait > MAX_WAIT_MS) {
      throw new Error(
        `${step}: the free Gemini allowance for ${model} is used up for today (resets in about ${Math.ceil(wait / 3_600_000)} h). ` +
          "Set GEMINI_MODEL in .env.local to another model, or try the demo",
      );
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}
