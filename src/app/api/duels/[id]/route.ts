import { NextResponse } from "next/server";
import { requirePokerIdentity, callRpc, rpcErrorMessage, unauthorized } from "@/lib/poker-server";
import { publicDuel } from "@/lib/poker/duel-flow";

export const runtime = "nodejs";

// GET: role-based duel state for the viewer. Public to signed-in users so a
// challenge link works for anyone with an account.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  const { id } = await params;
  try {
    const state = await callRpc(identity.token, "snake_duels_state", { p_duel_id: id });
    const duel = publicDuel(state);
    if (!duel) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ duel });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
