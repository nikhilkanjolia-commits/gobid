import "server-only";

// Calls a Postgres function in Supabase over its REST API with the server-only service key.
// Returns null when Supabase isn't configured, so routes can say so clearly.
export async function callSupabaseFunction<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase ${name} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
