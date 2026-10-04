import { NextResponse } from "next/server";
import { requirePokerIdentity } from "@/lib/poker-server";
import { SUPABASE_AUTH_KEY as SERVICE_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export interface CollectionSnake {
  id: string;
  name: string;
  detail: string;
  lifeStage: "neonate" | "juvenile" | "subadult" | "adult";
  game: "gtp" | "emerald";
}

const GTP_STAGE: Record<string, CollectionSnake["lifeStage"]> = {
  Hatchling: "neonate",
  Neonate: "neonate",
  Subadult: "subadult",
  Adult: "adult",
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// GET: slim list of the player's owned keeper snakes (both keeper games)
// for the stakes claim picker. Server-proven from the player's own save.
export async function GET() {
  const identity = await requirePokerIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in to play with a saved bankroll." }, { status: 401 });
  try {
    const res = await fetch(
      `${SUPABASE_AUTH_URL}/rest/v1/chondro_game_saves?user_id=eq.${encodeURIComponent(identity.user.id)}&select=state&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${identity.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error("save fetch failed");
    const rows = (await res.json()) as Array<{ state?: unknown }>;
    const state = asRecord(rows[0]?.state);

    const snakes: CollectionSnake[] = [];

    const colony = state.colony;
    if (Array.isArray(colony)) {
      for (const raw of colony) {
        const a = asRecord(raw);
        const id = String(a.id ?? "");
        if (!id) continue;
        snakes.push({
          id: `gtp:${id}`,
          name: String(a.name ?? "").trim() || "Unnamed Green Tree Python",
          detail: String(a.locality ?? a.subspecies ?? "").trim() || "Green tree python",
          lifeStage: GTP_STAGE[String(a.lifeStage ?? "")] ?? "neonate",
          game: "gtp",
        });
      }
    }

    const emerald = asRecord(state.emeraldKeeper);
    if (Array.isArray(emerald.animals)) {
      for (const raw of emerald.animals) {
        const a = asRecord(raw);
        const id = String(a.id ?? "");
        if (!id) continue;
        const stage = String(a.lifeStage ?? "");
        snakes.push({
          id: `emerald:${id}`,
          name: String(a.name ?? "").trim() || "Unnamed Emerald Tree Boa",
          detail: String(a.speciesId ?? "").trim() || "Emerald tree boa",
          lifeStage: stage === "subadult" ? "subadult" : stage === "adult" ? "adult" : "neonate",
          game: "emerald",
        });
      }
    }

    return NextResponse.json({ animals: snakes });
  } catch {
    return NextResponse.json({ error: "Could not load your collection." }, { status: 502 });
  }
}
