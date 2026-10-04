import { NextResponse } from "next/server";
import { requirePokerIdentity, callRpc, rpcErrorMessage, unauthorized } from "@/lib/poker-server";
import { publicDuel } from "@/lib/poker/duel-flow";

export const runtime = "nodejs";

// POST { asset_key }: stake a snake and open a keeper duel challenge.
export async function POST(request: Request) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
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
    const duelId = await callRpc<string>(identity.token, "snake_duels_create", {
      p_asset_key: assetKey,
    });
    const state = await callRpc(identity.token, "snake_duels_state", { p_duel_id: duelId });
    return NextResponse.json({ duel_id: duelId, duel: publicDuel(state) });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
