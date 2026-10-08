import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

const headersFor = (token: string, prefer?: string) => ({
  apikey: SUPABASE_AUTH_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  ...(prefer ? { Prefer: prefer } : {}),
});

type SaveRow = { state?: { colony?: Array<Record<string, unknown>>; clutchHistory?: Array<{ dam?: Record<string, unknown>; sire?: Record<string, unknown>; offspring?: Array<Record<string, unknown>> }> } };

async function loadOwnAnimals(token: string, userId: string) {
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(userId)}&select=state&limit=1`, {
    headers: headersFor(token),
    cache: "no-store",
  });
  if (!response.ok) return [] as Array<Record<string, unknown>>;
  const rows = (await response.json()) as SaveRow[];
  const found = new Map<string, Record<string, unknown>>();
  const add = (snake?: Record<string, unknown>) => {
    const id = String(snake?.id ?? "");
    if (id && snake && !found.has(id)) found.set(id, snake);
  };
  const state = rows[0]?.state;
  for (const snake of state?.colony ?? []) add(snake);
  for (const record of state?.clutchHistory ?? []) {
    add(record.dam);
    add(record.sire);
    for (const snake of record.offspring ?? []) add(snake);
  }
  return [...found.values()];
}

export async function GET() {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });

  const [linesResponse, animals] = await Promise.all([
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_lines?owner_id=eq.${encodeURIComponent(identity.user.id)}&select=id,owner_id,name,focus,founder_snake_id,created_at,updated_at&order=created_at.asc`, {
      headers: headersFor(identity.token),
      cache: "no-store",
    }),
    loadOwnAnimals(identity.token, identity.user.id),
  ]);

  if (!linesResponse.ok) return NextResponse.json({ error: "Unable to load breeder lines." }, { status: 502 });
  const lines = await linesResponse.json();
  return NextResponse.json({ authenticated: true, lines, animals });
}

export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in to create breeder lines." }, { status: 401 });

  const body = (await request.json()) as { action?: string; name?: string; focus?: string; founderSnakeId?: string; lineId?: string };

  if (body.action === "delete") {
    const lineId = String(body.lineId ?? "");
    const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_lines?id=eq.${encodeURIComponent(lineId)}&owner_id=eq.${encodeURIComponent(identity.user.id)}`, {
      method: "DELETE",
      headers: headersFor(identity.token, "return=representation"),
      cache: "no-store",
    });
    const rows = response.ok ? ((await response.json()) as unknown[]) : [];
    if (!response.ok || !rows.length) return NextResponse.json({ error: "That breeder line could not be removed." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  const name = String(body.name ?? "").trim().slice(0, 60);
  const focus = String(body.focus ?? "").trim().slice(0, 160);
  const founderSnakeId = String(body.founderSnakeId ?? "").slice(0, 160);
  if (name.length < 2 || !founderSnakeId) return NextResponse.json({ error: "Choose a line name and founder animal." }, { status: 400 });

  const animals = await loadOwnAnimals(identity.token, identity.user.id);
  if (!animals.some((snake) => String(snake.id ?? "") === founderSnakeId)) {
    return NextResponse.json({ error: "That founder animal is not in your recorded program." }, { status: 404 });
  }

  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_lines`, {
    method: "POST",
    headers: headersFor(identity.token, "return=representation"),
    body: JSON.stringify({ owner_id: identity.user.id, name, focus, founder_snake_id: founderSnakeId }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text.includes("duplicate") ? "You already have a breeder line with that name." : "That breeder line could not be created." }, { status: 409 });
  }
  const rows = await response.json();
  return NextResponse.json({ ok: true, line: rows[0] ?? null });
}
