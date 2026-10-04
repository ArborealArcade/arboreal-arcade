import { NextResponse } from "next/server";
import { requirePokerIdentity, callRpc, rpcErrorMessage, unauthorized } from "@/lib/poker-server";
import { publicDuel } from "@/lib/poker/duel-flow";

export const runtime = "nodejs";

// POST { asset_key }: accept an open challenge with a same-tier snake.
// The deck is shuffled and dealt inside the database; the caller supplies
// only their snake.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  const { id } = await params;
  let body: { asset_key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Pick a snake to stake." }, { status: 400 });
  }
  const assetKey = String(body.asset_key ?? "").trim();
  if (!assetKey) {
    return NextResponse.json({ error: "Pick a snake to stake." }, { status: 400 });
  }
  try {
    const state = await callRpc(identity.token, "snake_duels_accept", {
      p_duel_id: id,
      p_asset_key: assetKey,
    });
    const duel = publicDuel(state);
    if (!duel) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ duel });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
