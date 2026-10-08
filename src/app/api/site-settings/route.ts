import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

export const runtime = "nodejs";

// Public Arcade feature flags. Keys are allowlisted so this route can never
// leak arbitrary settings rows. Mirrors Planet's /api/site-settings.
const ALLOWED_KEYS = new Set(["shop_theme", "hank_costume"]);

export async function GET(request: NextRequest) {
  const key = (request.nextUrl.searchParams.get("key") ?? "").trim();
  if (!ALLOWED_KEYS.has(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const response = await fetch(
    `${SUPABASE_AUTH_URL}/rest/v1/arcade_settings?key=eq.${encodeURIComponent(key)}&select=key,value&limit=1`,
    { headers: { apikey: SUPABASE_AUTH_KEY, Accept: "application/json" }, cache: "no-store" }
  );
  if (!response.ok) return NextResponse.json({ error: "Could not load setting." }, { status: 500 });
  const rows = (await response.json().catch(() => [])) as Array<{ key: string; value: unknown }>;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ key: row.key, value: row.value });
}
