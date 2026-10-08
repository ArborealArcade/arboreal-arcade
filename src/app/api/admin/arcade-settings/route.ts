import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

export const runtime = "nodejs";

// Owner-only write for Arcade feature flags. The caller presents their
// Arcade JWT (Authorization: Bearer); the user_role claim must be "owner".
// The upsert is executed with the caller's own JWT so the RLS owner policy
// gates the write — a forged signature fails closed at PostgREST (401/403).
// Arcade JWTs are minted by Planet's server, which is the source of truth
// for roles; the Arcade never syncs user rows.
const ALLOWED_KEYS = new Set(["shop_theme", "hank_costume"]);

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function PUT(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const claims = decodePayload(token);
  if (!claims || claims.user_role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!ALLOWED_KEYS.has(key) || body?.value === undefined) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/arcade_settings`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_AUTH_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: body.value, updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? response.status : 500;
    return NextResponse.json({ error: "Could not save setting." }, { status });
  }
  return NextResponse.json({ key, value: body.value });
}
