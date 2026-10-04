import { NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";
import { publicSession, type SessionPublic } from "@/lib/poker/stake-flow";

export const runtime = "nodejs";

// GET: public session projection. The dealer's hole card and the undealt
// shoe never leave the server — open_hand is projected for the browser.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  const { id } = await params;
  try {
    const session = await callRpc<SessionPublic>(identity.token, "hatchling_stakes_session_public", {
      p_wager_id: id,
    });
    return NextResponse.json(publicSession(session));
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
