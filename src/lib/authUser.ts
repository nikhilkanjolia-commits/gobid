import "server-only";

export type AuthUser = { id: string; email: string };

// Checks the "Authorization: Bearer <token>" header with Supabase Auth and returns the
// signed-in user, or null if the token is missing, expired or fake.
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!token || !url || !key) return null;
  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id && user?.email ? { id: user.id, email: user.email } : null;
}
