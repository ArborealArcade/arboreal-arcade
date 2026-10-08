import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

const ALLOWED_KEYS = new Set([
  "cash",
  "colony",
  "facilityRooms",
  "facilityConstruction",
  "breedingCycle",
  "geneticTestsPending",
  "femaleRecovery",
  "lastRecoveryClutchId",
  "seasonCarePaid",
  "breedingMessage",
  "careerReputation",
  "claimedProjectIds",
  "claimedContractIds",
  "scoutsUsedSeason",
  "scoutsUsedThisSeason",
]);

async function readState(userId: string, token: string) {
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(userId)}&select=state&limit=1`, {
    headers: { apikey: SUPABASE_AUTH_KEY, Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("load failed");
  const rows = (await response.json()) as Array<{ state?: Record<string, unknown> }>;
  return rows[0]?.state && typeof rows[0].state === "object" ? rows[0].state : {};
}

export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });
  let body: { patch?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid progression action." }, { status: 400 }); }
  if (!body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) return NextResponse.json({ error: "Invalid progression patch." }, { status: 400 });

  const existing = await readState(identity.user.id, identity.token);
  const next = { ...existing };
  for (const [key, value] of Object.entries(body.patch)) if (ALLOWED_KEYS.has(key)) next[key] = value;

  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_AUTH_KEY,
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ user_id: identity.user.id, state: next, version: 1, updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "Unable to save progression." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
