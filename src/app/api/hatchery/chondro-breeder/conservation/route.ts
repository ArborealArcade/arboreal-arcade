import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

async function rpc(token: string, fn: string, body: Record<string, unknown> = {}) {
  return fetch(`${SUPABASE_AUTH_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_AUTH_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function GET() {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });

  const [statusResponse, ownResponse] = await Promise.all([
    rpc(identity.token, "chondro_conservation_status"),
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_conservation_contributions?user_id=eq.${encodeURIComponent(identity.user.id)}&select=snake_id,subspecies,phenotype_score,generation,contributed_at&order=contributed_at.desc&limit=100`, {
      headers: {
        apikey: SUPABASE_AUTH_KEY,
        Authorization: `Bearer ${identity.token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }),
  ]);

  if (!statusResponse.ok || !ownResponse.ok) {
    return NextResponse.json({ error: "Unable to load conservation program." }, { status: 502 });
  }

  return NextResponse.json({
    authenticated: true,
    status: await statusResponse.json(),
    own: await ownResponse.json(),
  });
}

export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });

  const body = await request.json().catch(() => null) as { snakeId?: string } | null;
  const snakeId = body?.snakeId?.trim();
  if (!snakeId || snakeId.length > 120) {
    return NextResponse.json({ error: "Choose a valid animal." }, { status: 400 });
  }

  const response = await rpc(identity.token, "chondro_contribute_animal", { p_snake_id: snakeId });
  if (!response.ok) {
    const text = await response.text();
    let message = "That animal could not be transferred to the conservation partnership.";
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {}
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = await response.json();
  const statusResponse = await rpc(identity.token, "chondro_conservation_status");
  return NextResponse.json({
    ok: true,
    contribution: result,
    status: statusResponse.ok ? await statusResponse.json() : null,
  });
}
