// Arcade Supabase project (arboreal-arcade, zuhovlszrohwtdxqrhnx). Must NEVER
// fall back to Planet's project or key — see src/lib/supabase-auth.ts.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://zuhovlszrohwtdxqrhnx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export async function supabasePublicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Arcade Supabase is not configured: set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "to the Arcade Supabase project's publishable key. This app intentionally " +
        "carries no Planet credential fallback."
    );
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${detail}`);
  }

  return response.json() as Promise<T>;
}

export { SUPABASE_URL };
