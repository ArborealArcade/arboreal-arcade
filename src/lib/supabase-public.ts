const SUPABASE_URL = "https://ykaqnxajszwgeqkmaora.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tYr_JfyA_WTGk8qNkL93iw_8uknK50C";

export async function supabasePublicFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
