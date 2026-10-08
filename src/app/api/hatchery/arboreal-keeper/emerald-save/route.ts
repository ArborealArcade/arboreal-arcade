import { NextRequest, NextResponse } from "next/server";
import { sanitizeEmeraldKeeperSave } from "@/lib/arboreal-keeper-emerald-engine";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

const MAX_EMERALD_SAVE_BYTES = 180_000;
const SAVE_KEY = "emeraldKeeper";

const apiHeaders = (token: string) => ({
  apikey: SUPABASE_AUTH_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function readRootState(userId: string, token: string) {
  const response = await fetch(
    `${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(userId)}&select=state,version,updated_at&limit=1`,
    {
      headers: { ...apiHeaders(token), Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Unable to read Arboreal Keeper save.");
  const rows = (await response.json()) as Array<{
    state?: unknown;
    version?: number;
    updated_at?: string;
  }>;
  const row = rows[0] ?? null;
  const state =
    row?.state && typeof row.state === "object" && !Array.isArray(row.state)
      ? (row.state as Record<string, unknown>)
      : {};
  return { state, version: row?.version ?? 1, updatedAt: row?.updated_at ?? null };
}

async function persistRootState(
  userId: string,
  token: string,
  state: Record<string, unknown>,
  version: number,
) {
  return fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?on_conflict=user_id`, {
    method: "POST",
    headers: {
      ...apiHeaders(token),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      user_id: userId,
      state,
      version,
      updated_at: new Date().toISOString(),
    }),
    cache: "no-store",
  });
}

export async function GET() {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });

  try {
    const root = await readRootState(identity.user.id, identity.token);
    const raw = root.state[SAVE_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ authenticated: true, save: null });
    }
    const save = sanitizeEmeraldKeeperSave(raw);
    return NextResponse.json({
      authenticated: true,
      save,
      updatedAt: save.updatedAt || root.updatedAt,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load Emerald Tree Boa save." }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });

  const raw = await request.text();
  if (!raw || raw.length > MAX_EMERALD_SAVE_BYTES) {
    return NextResponse.json({ error: "Emerald Tree Boa save is empty or too large." }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid Emerald Tree Boa save." }, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Invalid Emerald Tree Boa save." }, { status: 400 });
  }

  try {
    const root = await readRootState(identity.user.id, identity.token);
    const now = Date.now();
    const emerald = sanitizeEmeraldKeeperSave(parsed);
    emerald.updatedAt = now;

    const state: Record<string, unknown> = {
      ...root.state,
      [SAVE_KEY]: emerald,
    };

    const response = await persistRootState(
      identity.user.id,
      identity.token,
      state,
      root.version,
    );
    if (!response.ok) {
      return NextResponse.json({ error: "Unable to save Emerald Tree Boa program." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, savedAt: now });
  } catch {
    return NextResponse.json({ error: "Unable to save Emerald Tree Boa program." }, { status: 502 });
  }
}
