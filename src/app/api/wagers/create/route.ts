import { NextRequest, NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";
import { generateShoe } from "@/lib/poker/stake-blackjack";
import { publicSession, type SessionPublic } from "@/lib/poker/stake-flow";

export const runtime = "nodejs";

// POST { assetKey }: create an NPC stake -> the house mints a counter-stake
// at the same tier, both hatchlings lock, the server shoe attaches, and the
// wager enters in_progress. Returns the public session projection.
export async function POST(request: NextRequest) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  let body: { assetKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const assetKey = String(body.assetKey ?? "").trim();
  if (!assetKey || assetKey.length > 120) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const created = await callRpc<{ wager_id: string }>(identity.token, "hatchling_stakes_create_npc_wager", {
      p_asset_key: assetKey,
    });
    const { shoe, commitment } = generateShoe();
    await callRpc<boolean>(identity.token, "hatchling_stakes_start_session", {
      p_wager_id: created.wager_id,
      p_seed_commitment: commitment,
      p_shoe: shoe,
    });
    const session = await callRpc<SessionPublic>(identity.token, "hatchling_stakes_session_public", {
      p_wager_id: created.wager_id,
    });
    return NextResponse.json({ wagerId: created.wager_id, session: publicSession(session) });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
