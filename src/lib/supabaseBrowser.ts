"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The browser's Supabase client, used only for signing in (email code) and keeping the
// session. It uses the public anon key; all data goes through GoBid's own API routes.
let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

// Headers for GoBid API calls made as the signed-in user.
export async function authHeaders(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const token = (await sb?.auth.getSession())?.data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}
