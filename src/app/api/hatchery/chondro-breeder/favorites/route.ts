import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

const authHeaders = (token: string) => ({
  apikey: SUPABASE_AUTH_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function loadState(userId: string, token: string) {
  const response = await fetch(
    `${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(userId)}&select=state&limit=1`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ state?: Record<string, unknown> }>;
  return rows[0]?.state ?? null;
}

export async function GET() {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false, favoriteIds: [] }, { status: 401 });
  const state = await loadState(identity.user.id, identity.token);
  const favoriteIds = Array.isArray(state?.favoriteIds)
    ? state.favoriteIds.map((id) => String(id)).slice(0, 500)
    : [];
  return NextResponse.json({ authenticated: true, favoriteIds });
}

export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in to manage favorites." }, { status: 401 });

  const body = (await request.json()) as { snakeId?: string; favorite?: boolean };
  const snakeId = String(body.snakeId ?? "").slice(0, 160);
  if (!snakeId) return NextResponse.json({ error: "Missing snake." }, { status: 400 });

  const state = await loadState(identity.user.id, identity.token);
  if (!state) return NextResponse.json({ error: "Start Chondro Breeder first." }, { status: 409 });

  const colony = Array.isArray(state.colony) ? state.colony as Array<Record<string, unknown>> : [];
  const exists = colony.some((animal) => String(animal.id ?? "") === snakeId);
  if (!exists) return NextResponse.json({ error: "That snake is not currently in your colony." }, { status: 409 });

  const current = Array.isArray(state.favoriteIds)
    ? state.favoriteIds.map((id) => String(id)).filter(Boolean)
    : [];
  const next = body.favorite === false
    ? current.filter((id) => id !== snakeId)
    : Array.from(new Set([...current, snakeId])).slice(0, 500);

  const response = await fetch(
    `${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(identity.user.id)}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(identity.token), Prefer: "return=minimal" },
      body: JSON.stringify({
        state: { ...state, favoriteIds: next },
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) return NextResponse.json({ error: "Unable to update favorites." }, { status: 502 });
  return NextResponse.json({ ok: true, favoriteIds: next });
}
