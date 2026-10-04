import { NextResponse } from "next/server";
import { requirePokerIdentity, callRpc, rpcErrorMessage, unauthorized } from "@/lib/poker-server";

export const runtime = "nodejs";

// POST { reason? }: challenger cancels an open challenge. Snake unlocks,
// token refunded. Once accepted there are no take-backs — fold instead.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  const { id } = await params;
  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    await callRpc<boolean>(identity.token, "snake_duels_void", {
      p_duel_id: id,
      p_reason: String(body.reason ?? "cancelled by challenger").slice(0, 200),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
