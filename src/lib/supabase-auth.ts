import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Arcade Supabase project (arboreal-arcade, zuhovlszrohwtdxqrhnx). This code must
// NEVER fall back to Planet's project — a missing env var should fail loudly
// instead of silently talking to Planet's database.
const ARCADE_SUPABASE_URL = "https://zuhovlszrohwtdxqrhnx.supabase.co";

export const SUPABASE_AUTH_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ARCADE_SUPABASE_URL;

// Intentionally no hardcoded key fallback: the Arcade publishable key comes
// from NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (set in Vercel first thing when the
// Arcade project is created). An empty key fails loudly at request time.
export const SUPABASE_AUTH_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function assertSupabaseConfigured() {
  if (!SUPABASE_AUTH_KEY) {
    throw new Error(
      "Arcade Supabase is not configured: set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "to the Arcade Supabase project's publishable key. This app intentionally " +
        "carries no Planet credential fallback."
    );
  }
}
export const ACCESS_COOKIE = "ap_access";
export const REFRESH_COOKIE = "ap_refresh";

type AuthSession = { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } };

export async function supabaseAuthRequest(path: string, init: RequestInit = {}, bearer?: string) {
  assertSupabaseConfigured();
  return fetch(`${SUPABASE_AUTH_URL}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_AUTH_KEY,
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function verifyAccessToken(token: string) {
  const response = await supabaseAuthRequest("user", { method: "GET" }, token);
  if (!response.ok) return null;
  return response.json() as Promise<{ id: string; email?: string | null; user_metadata?: Record<string, unknown> }>;
}

export async function refreshAuthSession(refreshToken: string): Promise<AuthSession | null> {
  const response = await supabaseAuthRequest("token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;
  return response.json() as Promise<AuthSession>;
}

export function writeAuthCookies(response: NextResponse, session: AuthSession) {
  if (!session.access_token || !session.refresh_token) return;
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_COOKIE, session.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: session.expires_in ?? 3600 });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getServerIdentity() {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (token) {
    const user = await verifyAccessToken(token);
    if (user) return { token, user };
  }

  if (refreshToken) {
    const session = await refreshAuthSession(refreshToken);
    if (session?.access_token) {
      const user = session.user ?? await verifyAccessToken(session.access_token);
      if (user) return { token: session.access_token, user };
    }
  }

  return null;
}

export async function fetchOwnProfile(token: string, userId: string) {
  assertSupabaseConfigured();
  const fields = "id,username,display_name,bio,location,avatar_url,banner_url,accent_color,profile_visibility,seller_enabled,role,website_url,instagram_url,facebook_url,seller_verification_status,seller_verification_requested_at,seller_verified_at";
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${fields}`, {
    headers: { apikey: SUPABASE_AUTH_KEY, Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}


export async function getSnakeSorterAccess(token: string, userId: string) {
  assertSupabaseConfigured();
  const profile = await fetchOwnProfile(token, userId) as { role?: string } | null;
  if (profile?.role === "owner") return { allowed: true, isOwner: true, accessLevel: "owner" as const };

  const response = await fetch(
    `${SUPABASE_AUTH_URL}/rest/v1/snake_sorter_members?user_id=eq.${encodeURIComponent(userId)}&is_enabled=eq.true&select=access_level&limit=1`,
    {
      headers: {
        apikey: SUPABASE_AUTH_KEY,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!response.ok) return { allowed: false, isOwner: false, accessLevel: null };
  const rows = await response.json() as Array<{ access_level?: string }>;
  if (!rows[0]) return { allowed: false, isOwner: false, accessLevel: null };
  return { allowed: true, isOwner: false, accessLevel: rows[0].access_level ?? "scanner" };
}
