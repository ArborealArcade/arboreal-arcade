import { NextRequest, NextResponse } from "next/server";
import {
  getServerIdentity,
  SUPABASE_AUTH_KEY,
  SUPABASE_AUTH_URL,
} from "@/lib/supabase-auth";

const restHeaders = (token: string, prefer?: string) => ({
  apikey: SUPABASE_AUTH_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  ...(prefer ? { Prefer: prefer } : {}),
});

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
  updated_at: string;
};

type BreederIdentityRow = { user_id: string; initials: string };
type ProfileRow = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};
type ShowcaseRow = {
  owner_id: string;
  snake_id: string;
  snake: Record<string, unknown>;
  updated_at: string;
};

type GameSaveRow = { state?: { colony?: Array<Record<string, unknown>> } };

function stripPrivateSnakeFields(snake: Record<string, unknown>) {
  const { notes: _notes, ...safe } = snake;
  void _notes;
  return safe;
}

async function readJson<T>(response: Response, fallback: T): Promise<T> {
  if (!response.ok) return fallback;
  try {
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const identity = await getServerIdentity();
  if (!identity)
    return NextResponse.json(
      { authenticated: false, breeders: [], friendships: [], showcase: [], ownAnimals: [] },
      { status: 401 },
    );

  const token = identity.token;
  const userId = identity.user.id;
  const headers = restHeaders(token);

  const [identitiesResponse, profilesResponse, friendshipsResponse, showcaseResponse, saveResponse] =
    await Promise.all([
      fetch(
        `${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_identities?select=user_id,initials&order=created_at.asc`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${SUPABASE_AUTH_URL}/rest/v1/profiles?select=id,username,display_name,avatar_url&order=created_at.asc`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_friendships?select=id,requester_id,addressee_id,status,created_at,updated_at&order=updated_at.desc`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_showcase?select=owner_id,snake_id,snake,updated_at&order=updated_at.desc&limit=500`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(userId)}&select=state&limit=1`,
        { headers, cache: "no-store" },
      ),
    ]);

  const identities = await readJson<BreederIdentityRow[]>(identitiesResponse, []);
  const profiles = await readJson<ProfileRow[]>(profilesResponse, []);
  const friendships = await readJson<FriendshipRow[]>(friendshipsResponse, []);
  const showcase = await readJson<ShowcaseRow[]>(showcaseResponse, []);
  const saves = await readJson<GameSaveRow[]>(saveResponse, []);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const showcaseCounts = new Map<string, number>();
  for (const item of showcase)
    showcaseCounts.set(item.owner_id, (showcaseCounts.get(item.owner_id) ?? 0) + 1);

  const breeders = identities.map((breeder) => {
    const profile = profileMap.get(breeder.user_id);
    return {
      userId: breeder.user_id,
      initials: breeder.initials,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? `Breeder ${breeder.initials}`,
      avatarUrl: profile?.avatar_url ?? null,
      showcaseCount: showcaseCounts.get(breeder.user_id) ?? 0,
      isSelf: breeder.user_id === userId,
    };
  });

  const publishedIds = new Set(
    showcase.filter((item) => item.owner_id === userId).map((item) => item.snake_id),
  );
  const ownAnimals = (saves[0]?.state?.colony ?? []).map((snake) => ({
    ...stripPrivateSnakeFields(snake),
    showcasePublished: publishedIds.has(String(snake.id ?? "")),
  }));

  return NextResponse.json({
    authenticated: true,
    userId,
    breeders,
    friendships,
    showcase,
    ownAnimals,
  });
}

export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity)
    return NextResponse.json({ error: "Sign in to use breeder friends." }, { status: 401 });

  const body = (await request.json()) as {
    action?: string;
    targetId?: string;
    friendshipId?: string;
    snakeId?: string;
  };
  const token = identity.token;
  const userId = identity.user.id;
  const headers = restHeaders(token);

  if (body.action === "request") {
    const targetId = String(body.targetId ?? "");
    if (!targetId || targetId === userId)
      return NextResponse.json({ error: "Choose another breeder." }, { status: 400 });

    const targetResponse = await fetch(
      `${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_identities?user_id=eq.${encodeURIComponent(targetId)}&select=user_id&limit=1`,
      { headers, cache: "no-store" },
    );
    const targets = await readJson<Array<{ user_id: string }>>(targetResponse, []);
    if (!targets.length)
      return NextResponse.json({ error: "That breeder is no longer available." }, { status: 404 });

    const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_friendships`, {
      method: "POST",
      headers: restHeaders(token, "return=representation"),
      body: JSON.stringify({ requester_id: userId, addressee_id: targetId, status: "pending" }),
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: text.includes("duplicate") ? "A friend connection already exists." : "Could not send that friend request." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, friendship: (await response.json())[0] ?? null });
  }

  if (body.action === "accept") {
    const friendshipId = String(body.friendshipId ?? "");
    const response = await fetch(
      `${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_friendships?id=eq.${encodeURIComponent(friendshipId)}`,
      {
        method: "PATCH",
        headers: restHeaders(token, "return=representation"),
        body: JSON.stringify({ status: "accepted", updated_at: new Date().toISOString() }),
        cache: "no-store",
      },
    );
    const rows = await readJson<FriendshipRow[]>(response, []);
    if (!response.ok || !rows.length)
      return NextResponse.json({ error: "That request could not be accepted." }, { status: 409 });
    return NextResponse.json({ ok: true, friendship: rows[0] });
  }

  if (body.action === "remove") {
    const friendshipId = String(body.friendshipId ?? "");
    const response = await fetch(
      `${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_friendships?id=eq.${encodeURIComponent(friendshipId)}`,
      { method: "DELETE", headers: restHeaders(token, "return=representation"), cache: "no-store" },
    );
    const rows = await readJson<FriendshipRow[]>(response, []);
    if (!response.ok || !rows.length)
      return NextResponse.json({ error: "That friend connection could not be removed." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "publish") {
    const snakeId = String(body.snakeId ?? "").slice(0, 160);
    const saveResponse = await fetch(
      `${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(userId)}&select=state&limit=1`,
      { headers, cache: "no-store" },
    );
    const saves = await readJson<GameSaveRow[]>(saveResponse, []);
    const snake = (saves[0]?.state?.colony ?? []).find((item) => String(item.id ?? "") === snakeId);
    if (!snake)
      return NextResponse.json({ error: "That snake is not in your active colony." }, { status: 404 });

    const response = await fetch(
      `${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_showcase?on_conflict=owner_id,snake_id`,
      {
        method: "POST",
        headers: restHeaders(token, "resolution=merge-duplicates,return=representation"),
        body: JSON.stringify({ owner_id: userId, snake_id: snakeId, snake: stripPrivateSnakeFields(snake) }),
        cache: "no-store",
      },
    );
    if (!response.ok)
      return NextResponse.json({ error: "That animal could not be added to your showcase." }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unpublish") {
    const snakeId = String(body.snakeId ?? "").slice(0, 160);
    const response = await fetch(
      `${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_showcase?owner_id=eq.${encodeURIComponent(userId)}&snake_id=eq.${encodeURIComponent(snakeId)}`,
      { method: "DELETE", headers: restHeaders(token, "return=representation"), cache: "no-store" },
    );
    if (!response.ok)
      return NextResponse.json({ error: "That animal could not be removed from your showcase." }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported breeder social action." }, { status: 400 });
}
