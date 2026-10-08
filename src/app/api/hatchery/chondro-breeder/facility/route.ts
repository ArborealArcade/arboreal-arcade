import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

const headers = (token: string, prefer?: string) => ({
  apikey: SUPABASE_AUTH_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  ...(prefer ? { Prefer: prefer } : {}),
});

async function json<T>(response: Response, fallback: T): Promise<T> {
  if (!response.ok) return fallback;
  try { return (await response.json()) as T; } catch { return fallback; }
}

type Space = {
  user_id: string;
  space_name: string;
  tagline: string;
  theme: string;
  layout: string;
  program_focus: string;
  updated_at: string;
};

type Friendship = { requester_id: string; addressee_id: string; status: string };
type Identity = { user_id: string; initials: string };
type Profile = { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null };
type Showcase = { owner_id: string; snake_id: string; snake: Record<string, unknown> };

export async function GET() {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });
  const token = identity.token;
  const userId = identity.user.id;
  const h = headers(token);

  const [spacesR, friendsR, identitiesR, profilesR, showcaseR] = await Promise.all([
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_spaces?select=user_id,space_name,tagline,theme,layout,program_focus,updated_at`, { headers: h, cache: "no-store" }),
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_friendships?status=eq.accepted&select=requester_id,addressee_id,status`, { headers: h, cache: "no-store" }),
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_identities?select=user_id,initials`, { headers: h, cache: "no-store" }),
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/profiles?select=id,username,display_name,avatar_url`, { headers: h, cache: "no-store" }),
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_showcase?select=owner_id,snake_id,snake&limit=500`, { headers: h, cache: "no-store" }),
  ]);

  const spaces = await json<Space[]>(spacesR, []);
  const friendships = await json<Friendship[]>(friendsR, []);
  const identities = await json<Identity[]>(identitiesR, []);
  const profiles = await json<Profile[]>(profilesR, []);
  const showcase = await json<Showcase[]>(showcaseR, []);
  const friendIds = new Set<string>();
  for (const f of friendships) {
    if (f.requester_id === userId) friendIds.add(f.addressee_id);
    if (f.addressee_id === userId) friendIds.add(f.requester_id);
  }
  const spaceMap = new Map(spaces.map((s) => [s.user_id, s]));
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const initialsMap = new Map(identities.map((i) => [i.user_id, i.initials]));

  const decorate = (id: string) => ({
    userId: id,
    initials: initialsMap.get(id) ?? "--",
    profile: profileMap.get(id) ?? null,
    space: spaceMap.get(id) ?? null,
    animals: showcase.filter((item) => item.owner_id === id),
  });

  return NextResponse.json({
    authenticated: true,
    userId,
    own: decorate(userId),
    friends: [...friendIds].map(decorate),
  });
}

export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in to customize your breeder space." }, { status: 401 });
  const body = await request.json() as { spaceName?: string; tagline?: string; theme?: string; layout?: string; programFocus?: string };
  const theme = ["canopy","moss","mist","ember","ocean","night"].includes(String(body.theme)) ? String(body.theme) : "canopy";
  const layout = ["gallery","spotlight","compact"].includes(String(body.layout)) ? String(body.layout) : "gallery";
  const programFocus = ["locality","traits","mixed","designer"].includes(String(body.programFocus)) ? String(body.programFocus) : "mixed";
  const payload = {
    user_id: identity.user.id,
    space_name: String(body.spaceName ?? "My Chondro Room").trim().slice(0, 60) || "My Chondro Room",
    tagline: String(body.tagline ?? "").trim().slice(0, 140),
    theme,
    layout,
    program_focus: programFocus,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_breeder_spaces?on_conflict=user_id`, {
    method: "POST",
    headers: headers(identity.token, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "Your breeder space could not be saved." }, { status: 502 });
  return NextResponse.json({ ok: true, space: (await response.json())[0] ?? payload });
}
