import { NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

function sanitizeState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, unknown>;
  const state = { ...(value as Record<string, unknown>) };
  const colony = Array.isArray(state.colony) ? state.colony : [];
  state.started = typeof state.started === "boolean" ? state.started : colony.length > 0;
  state.cash = Number.isFinite(Number(state.cash)) ? Number(state.cash) : 30000;
  state.colony = colony;
  state.tested = Array.isArray(state.tested) ? state.tested : [];
  state.damId = typeof state.damId === "string" ? state.damId : "";
  state.sireId = typeof state.sireId === "string" ? state.sireId : "";
  if (!state.clutch || typeof state.clutch !== "object" || Array.isArray(state.clutch) || !Array.isArray((state.clutch as Record<string, unknown>).offspring)) state.clutch = null;
  state.clutchHistory = Array.isArray(state.clutchHistory)
    ? state.clutchHistory.filter((record) => record && typeof record === "object" && !Array.isArray(record) && Array.isArray((record as Record<string, unknown>).offspring))
    : [];
  state.holdbacks = Array.isArray(state.holdbacks) ? state.holdbacks : [];
  state.season = Math.max(1, Number.isFinite(Number(state.season)) ? Math.floor(Number(state.season)) : 1);
  state.sales = Array.isArray(state.sales) ? state.sales : [];
  state.transfers = Array.isArray(state.transfers) ? state.transfers : [];
  const enclosures = state.enclosures && typeof state.enclosures === "object" && !Array.isArray(state.enclosures)
    ? state.enclosures as Record<string, unknown>
    : {};
  state.enclosures = {
    "Chondro Dojo Bin": Math.max(0, Number(enclosures["Chondro Dojo Bin"] ?? 0) || 0),
    "PVC Arboreal": Math.max(0, Number(enclosures["PVC Arboreal"] ?? 0) || 0),
  };
  state.purchasedStoreIds = Array.isArray(state.purchasedStoreIds) ? state.purchasedStoreIds : [];
  return state;
}

export async function POST() {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });

  const read = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(identity.user.id)}&select=state,version&limit=1`, {
    headers: { apikey: SUPABASE_AUTH_KEY, Authorization: `Bearer ${identity.token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!read.ok) return NextResponse.json({ error: "Unable to inspect game save." }, { status: 502 });

  const rows = (await read.json()) as Array<{ state?: unknown; version?: number }>;
  if (!rows.length) return NextResponse.json({ ok: true, repaired: false });

  const state = sanitizeState(rows[0]?.state);
  const write = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_AUTH_KEY,
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ user_id: identity.user.id, state, version: rows[0]?.version ?? 1, updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!write.ok) return NextResponse.json({ error: "Unable to repair game save." }, { status: 502 });

  return NextResponse.json({ ok: true, repaired: true });
}
